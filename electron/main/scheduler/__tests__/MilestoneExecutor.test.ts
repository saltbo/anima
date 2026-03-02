import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ProjectState, Milestone } from '../../../../src/types/index'

// ── Mock dependencies ───────────────────────────────────────────────────────

const mockGetProjectState = vi.fn<(path: string) => ProjectState>()
const mockPatchProjectState = vi.fn<(path: string, patch: Partial<ProjectState>) => ProjectState>()
const mockGetMilestones = vi.fn<(path: string) => Milestone[]>()
const mockSaveMilestone = vi.fn()
const mockGetCommitLog = vi.fn<(path: string, branch: string) => Promise<string>>()
const mockHasUncommittedChanges = vi.fn<(path: string) => Promise<boolean>>()
const mockAgentRun = vi.fn<(...args: any[]) => Promise<string>>()
const mockAgentContinue = vi.fn<(...args: any[]) => Promise<string>>()
const mockAgentStop = vi.fn()

vi.mock('../../data/state', () => ({
  getProjectState: (...args: any[]) => mockGetProjectState(...args),
  patchProjectState: (...args: any[]) => mockPatchProjectState(...args),
}))

vi.mock('../../data/milestones', () => ({
  getMilestones: (...args: any[]) => mockGetMilestones(...args),
  saveMilestone: (...args: any[]) => mockSaveMilestone(...args),
}))

vi.mock('../../data/git', () => ({
  getCommitLog: (...args: any[]) => mockGetCommitLog(...args),
  hasUncommittedChanges: (...args: any[]) => mockHasUncommittedChanges(...args),
}))

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
  currentIteration: { milestoneId: 'm-1', count: 0 },
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
    ...overrides,
  }
}

const mockNotifier = {
  broadcastStatus: vi.fn(),
  broadcastAgentEvent: vi.fn(),
  broadcastMilestoneUpdate: vi.fn(),
  notifyIterationPaused: vi.fn(),
  notifyRateLimited: vi.fn(),
  notifyMilestoneCompleted: vi.fn(),
}

function createExecutor(overrides: { onRateLimit?: (r: string) => void; onComplete?: () => void } = {}) {
  return new MilestoneExecutor({
    projectId: 'proj-1',
    projectPath: '/test/project',
    notifier: mockNotifier as any,
    onRateLimit: overrides.onRateLimit ?? vi.fn(),
    onComplete: overrides.onComplete ?? vi.fn(),
  })
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

    mockGetProjectState.mockReturnValue({ ...DEFAULT_STATE })
    mockPatchProjectState.mockImplementation((_path, patch) => ({ ...DEFAULT_STATE, ...patch }))
    mockGetMilestones.mockReturnValue([createMilestone()])
    mockGetCommitLog.mockResolvedValue('')
    mockHasUncommittedChanges.mockResolvedValue(false)
  })

  describe('complete on first iteration', () => {
    it('returns completed when acceptor passes all todos', async () => {
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accAllPassed(opts)
        return 'Implementation done. Commit: abc1234'
      })

      const executor = createExecutor()
      const result = await executor.execute(createMilestone())

      expect(result.outcome).toBe('completed')
      expect(mockSaveMilestone).toHaveBeenCalled()
      expect(mockNotifier.notifyMilestoneCompleted).toHaveBeenCalledWith('m-1')
    })

    it('stops both agents after completion', async () => {
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accAllPassed(opts)
        return 'done'
      })

      const executor = createExecutor()
      await executor.execute(createMilestone())

      // Both dev and acc agents should be stopped via finally
      expect(mockAgentStop).toHaveBeenCalledTimes(2)
      const stopKeys = mockAgentStop.mock.calls.map((c) => c[0] as string)
      expect(stopKeys.some((k) => k.includes('-dev-'))).toBe(true)
      expect(stopKeys.some((k) => k.includes('-acc-'))).toBe(true)
    })
  })

  describe('multi-round relay within single iteration', () => {
    it('relays messages between dev and acc via continue()', async () => {
      // Round 1: dev run() → acc run() (incomplete)
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accIncomplete(opts)
        return 'Implementation done'
      })

      // Round 2: dev continue() → acc continue() (all passed)
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

      const executor = createExecutor()
      const result = await executor.execute(createMilestone())

      expect(result.outcome).toBe('completed')
      // dev continue (fix) + acc continue (follow-up) = 2 continue calls
      expect(mockAgentContinue).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling — no retry, next iteration', () => {
    it('moves to next iteration when developer crashes', async () => {
      let devRunCount = 0

      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-dev-')) {
          devRunCount++
          if (devRunCount === 1) throw new Error('Agent crashed')
          return 'Implementation done'
        }
        return accAllPassed(opts)
      })

      let currentCount = 0
      mockGetProjectState.mockImplementation(() => ({
        ...DEFAULT_STATE,
        currentIteration: { milestoneId: 'm-1', count: currentCount },
      }))
      mockPatchProjectState.mockImplementation((_path, patch) => {
        if (patch.currentIteration?.count != null) currentCount = patch.currentIteration.count
        return { ...DEFAULT_STATE, ...patch }
      })

      const executor = createExecutor()
      const result = await executor.execute(createMilestone())

      // Iteration 1: dev crash → iteration 2: success
      expect(result.outcome).toBe('completed')
      expect(devRunCount).toBe(2)
    })

    it('moves to next iteration when acceptor crashes', async () => {
      let accRunCount = 0

      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) {
          accRunCount++
          if (accRunCount === 1) throw new Error('Acceptor crashed')
          return accAllPassed(opts)
        }
        return 'Implementation done'
      })

      let currentCount = 0
      mockGetProjectState.mockImplementation(() => ({
        ...DEFAULT_STATE,
        currentIteration: { milestoneId: 'm-1', count: currentCount },
      }))
      mockPatchProjectState.mockImplementation((_path, patch) => {
        if (patch.currentIteration?.count != null) currentCount = patch.currentIteration.count
        return { ...DEFAULT_STATE, ...patch }
      })

      const executor = createExecutor()
      const result = await executor.execute(createMilestone())

      expect(result.outcome).toBe('completed')
      expect(accRunCount).toBe(2)
    })
  })

  describe('rate limit handling', () => {
    it('returns rate_limited and calls onRateLimit', async () => {
      const onRateLimit = vi.fn()

      mockAgentRun.mockRejectedValue(new Error('Rate limit exceeded'))

      const executor = createExecutor({ onRateLimit })
      const result = await executor.execute(createMilestone())

      expect(result.outcome).toBe('rate_limited')
      expect(onRateLimit).toHaveBeenCalled()
      expect(mockNotifier.notifyRateLimited).toHaveBeenCalled()
    })
  })

  describe('max iterations', () => {
    it('returns max_iterations when count exceeds limit', async () => {
      mockGetProjectState.mockReturnValue({
        ...DEFAULT_STATE,
        currentIteration: { milestoneId: 'm-1', count: 20 },
      })

      const executor = createExecutor()
      const result = await executor.execute(createMilestone())

      expect(result.outcome).toBe('max_iterations')
      expect(mockPatchProjectState).toHaveBeenCalledWith('/test/project', expect.objectContaining({
        status: 'paused',
      }))
      expect(mockNotifier.notifyIterationPaused).toHaveBeenCalledWith('m-1', 'max_iterations')
    })
  })

  describe('abort', () => {
    it('returns aborted when abort() is called between iterations', async () => {
      // Battle 1: dev crash → quick incomplete without relay loop
      mockAgentRun.mockImplementation(async (key: string) => {
        if (key.includes('-dev-')) throw new Error('Agent crashed')
        return 'done'
      })

      const executor = createExecutor()

      // Abort when second iteration starts
      let iterCount = 0
      mockPatchProjectState.mockImplementation((_path, patch) => {
        if (patch.status === 'awake' && patch.currentIteration) {
          iterCount++
          if (iterCount >= 2) executor.abort()
        }
        return { ...DEFAULT_STATE, ...patch }
      })

      const result = await executor.execute(createMilestone())

      expect(result.outcome).toBe('aborted')
    })
  })

  describe('agentKey format', () => {
    it('includes projectId, milestoneId, role, and iteration in agent keys', async () => {
      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-acc-')) return accAllPassed(opts)
        return 'done'
      })

      const executor = createExecutor()
      await executor.execute(createMilestone())

      const runKeys = mockAgentRun.mock.calls.map((c) => c[0] as string)
      expect(runKeys).toContain('proj-1:m-1-dev-1')
      expect(runKeys).toContain('proj-1:m-1-acc-1')
    })
  })

  describe('agent cleanup on error', () => {
    it('stops both agents even when battle errors', async () => {
      mockAgentRun.mockRejectedValue(new Error('unexpected crash'))

      // Need multiple iterations to hit max — but we just test one battle cleanup
      // Set state to count=20 so max_iterations is hit after one failed battle
      mockGetProjectState.mockReturnValue({
        ...DEFAULT_STATE,
        currentIteration: { milestoneId: 'm-1', count: 19 },
      })

      const executor = createExecutor()
      await executor.execute(createMilestone())

      // Agents should still be stopped via finally block
      expect(mockAgentStop).toHaveBeenCalled()
    })
  })

  describe('feedback relay across iterations', () => {
    it('carries acceptor feedback to next iteration developer message', async () => {
      let iterDevMessages: string[] = []
      let battleCount = 0

      mockAgentRun.mockImplementation(async (key: string, opts: any) => {
        if (key.includes('-dev-')) {
          iterDevMessages.push(opts.firstMessage)
          return 'Implementation done'
        }
        // acc
        battleCount++
        if (battleCount === 1) return accIncomplete(opts)
        return accAllPassed(opts)
      })

      // Relay loop continues return feedback text (no todos → allPassed stays false)
      mockAgentContinue.mockResolvedValue('MILESTONE_INCOMPLETE: still broken')

      let currentCount = 0
      mockGetProjectState.mockImplementation(() => ({
        ...DEFAULT_STATE,
        currentIteration: { milestoneId: 'm-1', count: currentCount },
      }))
      mockPatchProjectState.mockImplementation((_path, patch) => {
        if (patch.currentIteration?.count != null) currentCount = patch.currentIteration.count
        return { ...DEFAULT_STATE, ...patch }
      })

      const executor = createExecutor()
      const result = await executor.execute(createMilestone())

      expect(result.outcome).toBe('completed')
      // Second dev message should contain the acceptor feedback from the relay loop
      expect(iterDevMessages.length).toBe(2)
      expect(iterDevMessages[1]).toContain('MILESTONE_INCOMPLETE')
    })
  })
})
