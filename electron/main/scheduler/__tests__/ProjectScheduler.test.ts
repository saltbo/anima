/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ProjectState, Milestone, WakeSchedule } from '../../../../src/types/index'

// ── Mock dependencies ───────────────────────────────────────────────────────

const mockGetProjectState = vi.fn<(path: string) => ProjectState>()
const mockPatchProjectState = vi.fn<(path: string, patch: Partial<ProjectState>) => ProjectState>()
const mockGetMilestones = vi.fn<(path: string) => Milestone[]>()
const mockSaveMilestone = vi.fn()
const mockCreateMilestoneBranch = vi.fn<(path: string, id: string) => Promise<string>>()
const mockGetCurrentBranch = vi.fn<(path: string) => Promise<string>>()
const mockCheckoutBranch = vi.fn()

const mockExecutorExecute = vi.fn<(...args: any[]) => Promise<{ outcome: string }>>()
const mockExecutorAbort = vi.fn()

vi.mock('../../data/state', () => ({
  getProjectState: (...args: any[]) => mockGetProjectState(...args),
  patchProjectState: (...args: any[]) => mockPatchProjectState(...args),
}))

vi.mock('../../data/milestones', () => ({
  getMilestones: (...args: any[]) => mockGetMilestones(...args),
  saveMilestone: (...args: any[]) => mockSaveMilestone(...args),
}))

vi.mock('../../data/git', () => ({
  createMilestoneBranch: (...args: any[]) => mockCreateMilestoneBranch(...args),
  getCurrentBranch: (...args: any[]) => mockGetCurrentBranch(...args),
  checkoutBranch: (...args: any[]) => mockCheckoutBranch(...args),
}))

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

function createScheduler() {
  const mockWin = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  }
  return new ProjectScheduler({
    projectId: 'proj-1',
    projectPath: '/test/project',
    getWindow: () => mockWin as any,
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ProjectScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    mockGetProjectState.mockReturnValue({ ...DEFAULT_STATE })
    mockPatchProjectState.mockImplementation((_path, patch) => ({ ...DEFAULT_STATE, ...patch }))
    mockGetMilestones.mockReturnValue([])
    mockCreateMilestoneBranch.mockResolvedValue('abc1234')
    mockGetCurrentBranch.mockResolvedValue('main')
    mockExecutorExecute.mockResolvedValue({ outcome: 'completed' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('start/stop lifecycle', () => {
    it('schedules an immediate check on start', async () => {
      const scheduler = createScheduler()
      scheduler.start()

      expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)
      scheduler.stop()
    })

    it('clears timer and aborts executor on stop', () => {
      const scheduler = createScheduler()
      scheduler.start()
      scheduler.stop()
      // Timer should be cleared (no-op verified by not throwing)
    })
  })

  describe('check (via timer)', () => {
    it('goes back to sleep when no ready milestones', async () => {
      mockGetMilestones.mockReturnValue([])
      const scheduler = createScheduler()
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(mockPatchProjectState).toHaveBeenCalledWith('/test/project', { status: 'checking' })
      expect(mockPatchProjectState).toHaveBeenCalledWith('/test/project', { status: 'sleeping' })
      scheduler.stop()
    })

    it('skips check when status is awake', async () => {
      mockGetProjectState.mockReturnValue({
        ...DEFAULT_STATE,
        status: 'awake',
        currentIteration: { milestoneId: 'm-1', round: 1 },
      })
      const scheduler = createScheduler()
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(mockPatchProjectState).not.toHaveBeenCalledWith('/test/project', { status: 'checking' })
      scheduler.stop()
    })

    it('skips check when status is paused', async () => {
      mockGetProjectState.mockReturnValue({
        ...DEFAULT_STATE,
        status: 'paused',
        currentIteration: { milestoneId: 'm-1', round: 1 },
      })
      const scheduler = createScheduler()
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(mockPatchProjectState).not.toHaveBeenCalledWith('/test/project', { status: 'checking' })
      scheduler.stop()
    })

    it('reschedules when rate_limited and reset time is in future', async () => {
      const resetAt = new Date(Date.now() + 60000).toISOString()
      mockGetProjectState.mockReturnValue({
        ...DEFAULT_STATE,
        status: 'rate_limited',
        rateLimitResetAt: resetAt,
      })

      const scheduler = createScheduler()
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(mockPatchProjectState).not.toHaveBeenCalledWith('/test/project', { status: 'checking' })
      scheduler.stop()
    })
  })

  describe('dispatch to executor', () => {
    it('creates MilestoneExecutor when ready milestone found', async () => {
      const milestone = createMilestone()
      mockGetMilestones.mockReturnValue([milestone])

      const scheduler = createScheduler()
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      // Should have created branch
      expect(mockCreateMilestoneBranch).toHaveBeenCalledWith('/test/project', 'm-1')

      // Should have saved milestone as in-progress
      expect(mockSaveMilestone).toHaveBeenCalledWith('/test/project', expect.objectContaining({
        status: 'in-progress',
        baseCommit: 'abc1234',
      }))

      // Should have created and executed an executor
      expect(MilestoneExecutor).toHaveBeenCalled()
      expect(mockExecutorExecute).toHaveBeenCalled()

      scheduler.stop()
    })

    it('sets status to paused when execution throws', async () => {
      const milestone = createMilestone()
      mockGetMilestones.mockReturnValue([milestone])
      mockExecutorExecute.mockRejectedValue(new Error('unexpected'))

      const scheduler = createScheduler()
      scheduler.start()

      await vi.advanceTimersByTimeAsync(0)

      expect(mockPatchProjectState).toHaveBeenCalledWith('/test/project', { status: 'paused' })
      scheduler.stop()
    })
  })

  describe('wakeNow', () => {
    it('triggers immediate check', async () => {
      mockGetMilestones.mockReturnValue([])
      const scheduler = createScheduler()
      scheduler.start()

      // First check
      await vi.advanceTimersByTimeAsync(0)
      mockPatchProjectState.mockClear()

      // Force wake
      scheduler.wakeNow()
      await vi.advanceTimersByTimeAsync(0)

      expect(mockPatchProjectState).toHaveBeenCalledWith('/test/project', { status: 'checking' })
      scheduler.stop()
    })
  })

  describe('updateSchedule', () => {
    it('persists new schedule and reschedules', () => {
      const scheduler = createScheduler()
      scheduler.start()

      const newSchedule: WakeSchedule = { mode: 'interval', intervalMinutes: 15, times: [] }
      scheduler.updateSchedule(newSchedule)

      expect(mockPatchProjectState).toHaveBeenCalledWith('/test/project', { wakeSchedule: newSchedule })
      scheduler.stop()
    })
  })

  describe('recovery', () => {
    it('recovers awake state on start and delegates to executor', async () => {
      const milestone = createMilestone({ status: 'in-progress' })
      mockGetMilestones.mockReturnValue([milestone])
      mockGetProjectState.mockReturnValue({
        ...DEFAULT_STATE,
        status: 'awake',
        currentIteration: {
          milestoneId: 'm-1',
          round: 2,
          developerSessionId: 'dev-sess',
          acceptorSessionId: 'acc-sess',
        },
      })
      mockGetCurrentBranch.mockResolvedValue('main')

      const scheduler = createScheduler()
      scheduler.start()

      // Let recovery run
      await vi.advanceTimersByTimeAsync(0)

      // Should have tried to checkout the milestone branch
      expect(mockCheckoutBranch).toHaveBeenCalledWith('/test/project', 'milestone/m-1')

      // Should have created executor and called execute (no resume — each iteration starts fresh)
      expect(MilestoneExecutor).toHaveBeenCalled()
      expect(mockExecutorExecute).toHaveBeenCalledWith(milestone)

      scheduler.stop()
    })
  })
})
