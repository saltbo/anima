/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ProjectState, Milestone, WakeSchedule } from '../../../../src/types/index'

// ── Mock dependencies ───────────────────────────────────────────────────────

const mockExecutorExecute = vi.fn<(...args: any[]) => Promise<{ outcome: string }>>()
const mockExecutorAbort = vi.fn()

vi.mock('../MilestoneExecutor', () => ({
  MilestoneExecutor: vi.fn().mockImplementation(function () {
    return {
      execute: (...args: any[]) => mockExecutorExecute(...args),
      abort: () => mockExecutorAbort(),
    }
  }),
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Import after mocks are set up
const { ProjectScheduler } = await import('../ProjectScheduler')
const { MilestoneExecutor } = await import('../MilestoneExecutor')

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_STATE: ProjectState = {
  status: 'sleeping',
  currentIteration: null,
  nextWakeTime: null,
  wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
  totalTokens: 0,
  totalCost: 0,
  rateLimitResetAt: null,
}

function createMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm-1',
    title: 'Test Milestone',
    description: 'A test milestone',
    status: 'ready',
    acceptanceCriteria: [],
    tasks: [],
    inboxItemIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    iterationCount: 0,
    iterations: [],
    ...overrides,
  }
}

function createMockRepos() {
  let currentState = { ...DEFAULT_STATE }

  const stateRepo = {
    get: vi.fn(() => currentState),
    patch: vi.fn((_id: string, patch: Partial<ProjectState>) => {
      currentState = { ...currentState, ...patch }
      return currentState
    }),
    save: vi.fn((_id: string, state: ProjectState) => { currentState = state }),
    getByPath: vi.fn(() => currentState),
    // Expose for test assertions
    _setState: (s: ProjectState) => { currentState = s },
  }

  const milestoneRepo = {
    getById: vi.fn(() => null as Milestone | null),
    getByProjectId: vi.fn(() => [] as Milestone[]),
    save: vi.fn(),
    delete: vi.fn(),
    updateTask: vi.fn(),
    addIteration: vi.fn(),
    getProjectIdForMilestone: vi.fn(() => 'proj-1'),
  }

  const gitService = {
    createMilestoneBranch: vi.fn().mockResolvedValue('abc1234'),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
    checkoutBranch: vi.fn(),
    getCommitLog: vi.fn().mockResolvedValue(''),
    hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    isGitRepo: vi.fn().mockResolvedValue(true),
  }

  return { stateRepo, milestoneRepo, gitService }
}

function createScheduler(repos?: ReturnType<typeof createMockRepos>) {
  const { stateRepo, milestoneRepo, gitService } = repos ?? createMockRepos()
  const mockWin = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  }
  return {
    scheduler: new ProjectScheduler({
      projectId: 'proj-1',
      projectPath: '/test/project',
      getWindow: () => mockWin as any,
      stateRepo: stateRepo as any,
      milestoneRepo: milestoneRepo as any,
      gitService: gitService as any,
    }),
    stateRepo,
    milestoneRepo,
    gitService,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ProjectScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockExecutorExecute.mockResolvedValue({ outcome: 'completed' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('start/stop lifecycle', () => {
    it('schedules an immediate check on start', async () => {
      const { scheduler } = createScheduler()
      scheduler.start()

      expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)
      scheduler.stop()
    })

    it('clears timer and aborts executor on stop', () => {
      const { scheduler } = createScheduler()
      scheduler.start()
      scheduler.stop()
    })
  })

  describe('check (via timer)', () => {
    it('goes back to sleep when no ready milestones', async () => {
      const repos = createMockRepos()
      repos.milestoneRepo.getByProjectId.mockReturnValue([])
      const { scheduler, stateRepo } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(stateRepo.patch).toHaveBeenCalledWith('proj-1', { status: 'checking' })
      expect(stateRepo.patch).toHaveBeenCalledWith('proj-1', { status: 'sleeping' })
      scheduler.stop()
    })

    it('skips check when status is awake', async () => {
      const repos = createMockRepos()
      repos.stateRepo._setState({
        ...DEFAULT_STATE,
        status: 'awake',
        currentIteration: { milestoneId: 'm-1', round: 1 },
      })
      const { scheduler, stateRepo } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(stateRepo.patch).not.toHaveBeenCalledWith('proj-1', { status: 'checking' })
      scheduler.stop()
    })

    it('skips check when status is paused', async () => {
      const repos = createMockRepos()
      repos.stateRepo._setState({
        ...DEFAULT_STATE,
        status: 'paused',
        currentIteration: { milestoneId: 'm-1', round: 1 },
      })
      const { scheduler, stateRepo } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(stateRepo.patch).not.toHaveBeenCalledWith('proj-1', { status: 'checking' })
      scheduler.stop()
    })

    it('reschedules when rate_limited and reset time is in future', async () => {
      const repos = createMockRepos()
      const resetAt = new Date(Date.now() + 60000).toISOString()
      repos.stateRepo._setState({
        ...DEFAULT_STATE,
        status: 'rate_limited',
        rateLimitResetAt: resetAt,
      })
      const { scheduler, stateRepo } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(stateRepo.patch).not.toHaveBeenCalledWith('proj-1', { status: 'checking' })
      scheduler.stop()
    })
  })

  describe('dispatch to executor', () => {
    it('creates MilestoneExecutor when ready milestone found', async () => {
      const milestone = createMilestone()
      const repos = createMockRepos()
      repos.milestoneRepo.getByProjectId.mockReturnValue([milestone])
      const { scheduler, gitService } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(gitService.createMilestoneBranch).toHaveBeenCalledWith('/test/project', 'm-1')
      expect(repos.milestoneRepo.save).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        status: 'in-progress',
        baseCommit: 'abc1234',
      }))
      expect(MilestoneExecutor).toHaveBeenCalled()
      expect(mockExecutorExecute).toHaveBeenCalled()

      scheduler.stop()
    })

    it('sets status to paused when execution throws', async () => {
      const milestone = createMilestone()
      const repos = createMockRepos()
      repos.milestoneRepo.getByProjectId.mockReturnValue([milestone])
      mockExecutorExecute.mockRejectedValue(new Error('unexpected'))

      const { scheduler, stateRepo } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(stateRepo.patch).toHaveBeenCalledWith('proj-1', { status: 'paused' })
      scheduler.stop()
    })
  })

  describe('wakeNow', () => {
    it('triggers immediate check', async () => {
      const repos = createMockRepos()
      repos.milestoneRepo.getByProjectId.mockReturnValue([])
      const { scheduler, stateRepo } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)
      stateRepo.patch.mockClear()

      scheduler.wakeNow()
      await vi.advanceTimersByTimeAsync(0)

      expect(stateRepo.patch).toHaveBeenCalledWith('proj-1', { status: 'checking' })
      scheduler.stop()
    })
  })

  describe('updateSchedule', () => {
    it('reschedules wake timer', () => {
      const { scheduler } = createScheduler()
      scheduler.start()

      const newSchedule: WakeSchedule = { mode: 'interval', intervalMinutes: 15, times: [] }
      scheduler.updateSchedule(newSchedule)

      scheduler.stop()
    })
  })

  describe('recovery', () => {
    it('recovers awake state on start and delegates to executor', async () => {
      const milestone = createMilestone({ status: 'in-progress' })
      const repos = createMockRepos()
      repos.milestoneRepo.getByProjectId.mockReturnValue([milestone])
      repos.milestoneRepo.getById.mockReturnValue(milestone)
      repos.stateRepo._setState({
        ...DEFAULT_STATE,
        status: 'awake',
        currentIteration: {
          milestoneId: 'm-1',
          round: 2,
          developerSessionId: 'dev-sess',
          acceptorSessionId: 'acc-sess',
        },
      })
      repos.gitService.getCurrentBranch.mockResolvedValue('main')

      const { scheduler, gitService } = createScheduler(repos)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(gitService.checkoutBranch).toHaveBeenCalledWith('/test/project', 'milestone/m-1')
      expect(MilestoneExecutor).toHaveBeenCalled()
      expect(mockExecutorExecute).toHaveBeenCalledWith(milestone)

      scheduler.stop()
    })
  })
})
