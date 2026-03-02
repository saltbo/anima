/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ProjectState, Milestone, Iteration } from '../../../../src/types/index'

// ── Mock dependencies ───────────────────────────────────────────────────────

const mockAgentRun = vi.fn<(...args: any[]) => Promise<string>>()
const mockAgentContinue = vi.fn<(...args: any[]) => Promise<string>>()
const mockAgentStop = vi.fn()

vi.mock('../../agents/service', () => ({
  conversationAgent: {
    run: (...args: any[]) => mockAgentRun(...args),
    continue: (...args: any[]) => mockAgentContinue(...args),
    stop: (...args: any[]) => mockAgentStop(...args),
  },
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Import after mocks
const { MilestoneExecutor } = await import('../MilestoneExecutor')

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_STATE: ProjectState = {
  status: 'awake',
  currentIteration: { milestoneId: 'm-1', round: 0 },
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
    status: 'in-progress',
    acceptanceCriteria: [],
    tasks: [],
    inboxItemIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    iterationCount: 0,
    iterations: [],
    ...overrides,
  }
}

/** Create N dummy iteration records */
function createIterations(n: number): Iteration[] {
  return Array.from({ length: n }, (_, i) => ({
    milestoneId: 'm-1',
    round: i + 1,
    outcome: 'rejected' as const,
    startedAt: `2026-01-01T0${i}:00:00Z`,
    completedAt: `2026-01-01T0${i}:10:00Z`,
  }))
}

const mockNotifier = {
  broadcastStatus: vi.fn(),
  broadcastAgentEvent: vi.fn(),
  broadcastMilestoneUpdate: vi.fn(),
  notifyIterationPaused: vi.fn(),
  notifyRateLimited: vi.fn(),
  notifyMilestoneCompleted: vi.fn(),
}

/** Create mock repos that simulate in-memory state */
function createMockRepos(milestone: Milestone) {
  let currentState = { ...DEFAULT_STATE }
  const milestoneStore = { current: milestone }

  const stateRepo = {
    get: vi.fn(() => currentState),
    patch: vi.fn((_id: string, patch: Partial<ProjectState>) => {
      currentState = { ...currentState, ...patch }
      return currentState
    }),
    save: vi.fn((_id: string, state: ProjectState) => { currentState = state }),
    getByPath: vi.fn(() => currentState),
  }

  const milestoneRepo = {
    getById: vi.fn((id: string) => id === milestone.id ? milestoneStore.current : null),
    getByProjectId: vi.fn(() => [milestoneStore.current]),
    save: vi.fn((_pid: string, m: Milestone) => { milestoneStore.current = m }),
    delete: vi.fn(),
    updateTask: vi.fn(),
    addIteration: vi.fn(),
    getProjectIdForMilestone: vi.fn(() => 'proj-1'),
  }

  const gitService = {
    getCommitLog: vi.fn().mockResolvedValue(''),
    hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    createMilestoneBranch: vi.fn().mockResolvedValue('abc123'),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
    checkoutBranch: vi.fn(),
    isGitRepo: vi.fn().mockResolvedValue(true),
  }

  return { stateRepo, milestoneRepo, gitService, milestoneStore }
}

function createExecutor(
  milestone: Milestone,
  overrides: { onRateLimit?: (r: string) => void; onComplete?: () => void } = {}
) {
  const { stateRepo, milestoneRepo, gitService } = createMockRepos(milestone)
  return {
    executor: new MilestoneExecutor({
      projectId: 'proj-1',
      projectPath: '/test/project',
      notifier: mockNotifier as any,
      stateRepo: stateRepo as any,
      milestoneRepo: milestoneRepo as any,
      gitService: gitService as any,
      onRateLimit: overrides.onRateLimit ?? vi.fn(),
      onComplete: overrides.onComplete ?? vi.fn(),
    }),
    stateRepo,
    milestoneRepo,
  }
}

/** Helper: make acceptor emit all-passed TodoWrite and return MILESTONE_COMPLETE */
function accAllPassed(opts: any): string {
  opts.onEvent({
    event: 'tool_use',
    toolName: 'TodoWrite',
    toolInput: JSON.stringify({
      todos: [{ id: 'ac1', content: 'Criterion met', status: 'completed' }],
    }),
    toolCallId: 'tc-1',
  })
  return 'All criteria met. MILESTONE_COMPLETE'
}

/** Helper: make acceptor emit incomplete TodoWrite */
function accIncomplete(opts: any): string {
  opts.onEvent({
    event: 'tool_use',
    toolName: 'TodoWrite',
    toolInput: JSON.stringify({
      todos: [{ id: 'ac1', content: 'Login works', status: 'pending' }],
    }),
    toolCallId: 'tc-1',
  })
  return 'MILESTONE_INCOMPLETE: Login button missing validation'
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MilestoneExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('complete on first iteration', () => {
    it('returns completed when acceptor passes all todos', async () => {
      const milestone = createMilestone()
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accAllPassed(opts)
        return 'Implementation done. Commit: abc1234'
      })

      const { executor } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('completed')
      expect(mockNotifier.notifyMilestoneCompleted).toHaveBeenCalledWith('m-1')
    })

    it('stops both agents after completion', async () => {
      const milestone = createMilestone()
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accAllPassed(opts)
        return 'done'
      })

      const { executor } = createExecutor(milestone)
      await executor.execute(milestone)

      expect(mockAgentStop).toHaveBeenCalledTimes(2)
      const stopKeys = mockAgentStop.mock.calls.map((c) => c[0] as string)
      expect(stopKeys.some((k) => k.includes('-dev-'))).toBe(true)
      expect(stopKeys.some((k) => k.includes('-acc-'))).toBe(true)
    })
  })

  describe('multi-round relay within single iteration', () => {
    it('relays messages between dev and acc via continue()', async () => {
      const milestone = createMilestone()

      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accIncomplete(opts)
        return 'Implementation done'
      })

      mockAgentContinue.mockResolvedValueOnce('Fixed validation. Commit: def5678')
      mockAgentContinue.mockImplementation(async (_key: string, _msg: string, onEvent?: any) => {
        if (onEvent) {
          onEvent({
            event: 'tool_use',
            toolName: 'TodoWrite',
            toolInput: JSON.stringify({
              todos: [{ id: 'ac1', content: 'Login works', status: 'completed' }],
            }),
            toolCallId: 'tc-2',
          })
        }
        return 'All good. MILESTONE_COMPLETE'
      })

      const { executor } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('completed')
      expect(mockAgentContinue).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling — no retry, next iteration', () => {
    it('moves to next iteration when developer crashes', async () => {
      const milestone = createMilestone()

      let devRunCount = 0
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-dev-')) {
          devRunCount++
          if (devRunCount === 1) throw new Error('Agent crashed')
          return 'Implementation done'
        }
        return accAllPassed(opts)
      })

      const { executor } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('completed')
      expect(devRunCount).toBe(2)
    })

    it('moves to next iteration when acceptor crashes', async () => {
      const milestone = createMilestone()

      let accRunCount = 0
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) {
          accRunCount++
          if (accRunCount === 1) throw new Error('Acceptor crashed')
          return accAllPassed(opts)
        }
        return 'Implementation done'
      })

      const { executor } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('completed')
      expect(accRunCount).toBe(2)
    })
  })

  describe('rate limit handling', () => {
    it('returns rate_limited and calls onRateLimit', async () => {
      const milestone = createMilestone()
      const onRateLimit = vi.fn()

      mockAgentRun.mockRejectedValue(new Error('Rate limit exceeded'))

      const { executor } = createExecutor(milestone, { onRateLimit })
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('rate_limited')
      expect(onRateLimit).toHaveBeenCalled()
      expect(mockNotifier.notifyRateLimited).toHaveBeenCalled()
    })
  })

  describe('max iterations', () => {
    it('returns max_iterations when round exceeds limit', async () => {
      const milestone = createMilestone({ iterations: createIterations(20) })

      const { executor, stateRepo } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('max_iterations')
      expect(stateRepo.patch).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        status: 'paused',
      }))
      expect(mockNotifier.notifyIterationPaused).toHaveBeenCalledWith('m-1', 'max_iterations')
    })
  })

  describe('abort', () => {
    it('returns aborted when abort() is called between iterations', async () => {
      const milestone = createMilestone()
      const { stateRepo, milestoneRepo, gitService } = createMockRepos(milestone)

      const executor = new MilestoneExecutor({
        projectId: 'proj-1',
        projectPath: '/test/project',
        notifier: mockNotifier as any,
        stateRepo: stateRepo as any,
        milestoneRepo: milestoneRepo as any,
        gitService: gitService as any,
        onRateLimit: vi.fn(),
        onComplete: vi.fn(),
      })

      // Battle 1: dev crash
      mockAgentRun.mockImplementation(async (key: string) => {
        if (key.includes('-dev-')) throw new Error('Agent crashed')
        return 'done'
      })

      let iterCount = 0
      stateRepo.patch.mockImplementation((_id: string, patch: Partial<ProjectState>) => {
        if (patch.status === 'awake' && patch.currentIteration) {
          iterCount++
          if (iterCount >= 2) executor.abort()
        }
        return { ...DEFAULT_STATE, ...patch } as ProjectState
      })

      const result = await executor.execute(milestone)
      expect(result.outcome).toBe('aborted')
    })
  })

  describe('agentKey format', () => {
    it('includes projectId, milestoneId, role, and round in agent keys', async () => {
      const milestone = createMilestone()

      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accAllPassed(opts)
        return 'done'
      })

      const { executor } = createExecutor(milestone)
      await executor.execute(milestone)

      const runKeys = mockAgentRun.mock.calls.map((c) => c[0] as string)
      expect(runKeys).toContain('proj-1:m-1-dev-1')
      expect(runKeys).toContain('proj-1:m-1-acc-1')
    })
  })

  describe('agent cleanup on error', () => {
    it('stops both agents even when battle errors', async () => {
      const milestone = createMilestone({ iterations: createIterations(19) })

      mockAgentRun.mockRejectedValue(new Error('unexpected crash'))

      const { executor } = createExecutor(milestone)
      await executor.execute(milestone)

      expect(mockAgentStop).toHaveBeenCalled()
    })
  })

  describe('feedback relay across iterations', () => {
    it('carries acceptor feedback to next iteration developer message', async () => {
      const milestone = createMilestone()

      const iterDevMessages: string[] = []
      let battleCount = 0

      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-dev-')) {
          iterDevMessages.push(opts.firstMessage)
          return 'Implementation done'
        }
        battleCount++
        if (battleCount === 1) return accIncomplete(opts)
        return accAllPassed(opts)
      })

      mockAgentContinue.mockResolvedValue('MILESTONE_INCOMPLETE: still broken')

      const { executor } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('completed')
      expect(iterDevMessages.length).toBe(2)
      expect(iterDevMessages[1]).toContain('MILESTONE_INCOMPLETE')
    })
  })
})
