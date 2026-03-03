/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Project, Milestone, Iteration } from '../../../../src/types/index'

// ── Mock dependencies ───────────────────────────────────────────────────────

const mockAgentRun = vi.fn<(...args: any[]) => Promise<string>>()
const mockAgentContinue = vi.fn<(...args: any[]) => Promise<string>>()
const mockAgentStop = vi.fn()

const mockConversationAgent = {
  run: (...args: any[]) => mockAgentRun(...args),
  continue: (...args: any[]) => mockAgentContinue(...args),
  send: vi.fn(),
  stop: (...args: any[]) => mockAgentStop(...args),
}

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

const DEFAULT_PROJECT: Project = {
  id: 'proj-1',
  path: '/test/project',
  name: 'test',
  addedAt: '2026-01-01',
  status: 'awake',
  currentIteration: { milestoneId: 'm-1', round: 0 },
  nextWakeTime: null,
  wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
  autoMerge: false,
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
    createdAt: '2026-01-01T00:00:00Z',
    iterationCount: 0,
    iterations: [],
    totalTokens: 0,
    totalCost: 0,
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
  notifyMilestoneAwaitingReview: vi.fn(),
}

/** Create mock repos that simulate in-memory state */
function createMockRepos(milestone: Milestone) {
  let currentProject = { ...DEFAULT_PROJECT }
  const milestoneStore = { current: milestone }

  const projectRepo = {
    getAll: vi.fn(() => [currentProject]),
    getById: vi.fn(() => currentProject),
    getByPath: vi.fn(() => currentProject),
    add: vi.fn(),
    remove: vi.fn(),
    resolveProjectId: vi.fn(() => 'proj-1'),
    patch: vi.fn((_id: string, patch: Partial<Project>) => {
      currentProject = { ...currentProject, ...patch }
      return currentProject
    }),
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
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    squashMerge: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
    resetBranchToCommit: vi.fn().mockResolvedValue(undefined),
    getCommitCountSince: vi.fn().mockResolvedValue(0),
    getDiffStats: vi.fn().mockResolvedValue({ filesChanged: 0, insertions: 0, deletions: 0 }),
  }

  const commentRepo = {
    getByMilestoneId: vi.fn(() => []),
    add: vi.fn(),
    delete: vi.fn(),
  }

  return { projectRepo, milestoneRepo, commentRepo, gitService, milestoneStore }
}

function createExecutor(
  milestone: Milestone,
  overrides: { onRateLimit?: (r: string) => void; onComplete?: () => void } = {}
) {
  const { projectRepo, milestoneRepo, commentRepo, gitService } = createMockRepos(milestone)
  return {
    executor: new MilestoneExecutor({
      projectId: 'proj-1',
      projectPath: '/test/project',
      notifier: mockNotifier as any,
      projectRepo: projectRepo as any,
      milestoneRepo: milestoneRepo as any,
      commentRepo: commentRepo as any,
      gitService: gitService as any,
      conversationAgent: mockConversationAgent as any,
      onRateLimit: overrides.onRateLimit ?? vi.fn(),
      onComplete: overrides.onComplete ?? vi.fn(),
    }),
    projectRepo,
    milestoneRepo,
    commentRepo,
  }
}

/** Helper: make acceptor emit all-passed TodoWrite */
function accAllPassed(opts: any): string {
  opts.onEvent({
    event: 'tool_use',
    toolName: 'TodoWrite',
    toolInput: JSON.stringify({
      todos: [{ id: 'ac1', content: 'Criterion met', status: 'completed' }],
    }),
    toolCallId: 'tc-1',
  })
  return 'All criteria met.'
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
  return 'Login button missing validation'
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
      expect(mockNotifier.notifyMilestoneAwaitingReview).toHaveBeenCalledWith('m-1')
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
        return 'All good.'
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

      const { executor, projectRepo } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('max_iterations')
      expect(projectRepo.patch).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        status: 'paused',
      }))
      expect(mockNotifier.notifyIterationPaused).toHaveBeenCalledWith('m-1', 'max_iterations')
    })
  })

  describe('abort', () => {
    it('returns aborted when abort() is called between iterations', async () => {
      const milestone = createMilestone()
      const { projectRepo, milestoneRepo, commentRepo, gitService } = createMockRepos(milestone)

      const executor = new MilestoneExecutor({
        projectId: 'proj-1',
        projectPath: '/test/project',
        notifier: mockNotifier as any,
        projectRepo: projectRepo as any,
        milestoneRepo: milestoneRepo as any,
        commentRepo: commentRepo as any,
        gitService: gitService as any,
        conversationAgent: mockConversationAgent as any,
        onRateLimit: vi.fn(),
        onComplete: vi.fn(),
      })

      // Battle 1: dev crash
      mockAgentRun.mockImplementation(async (key: string) => {
        if (key.includes('-dev-')) throw new Error('Agent crashed')
        return 'done'
      })

      let iterCount = 0
      projectRepo.patch.mockImplementation((_id: string, patch: Partial<Project>) => {
        const updated = { ...DEFAULT_PROJECT, ...patch }
        if (patch.status === 'awake' && patch.currentIteration) {
          iterCount++
          if (iterCount >= 2) executor.abort()
        }
        return updated as Project
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

      mockAgentContinue.mockResolvedValue('Login button missing validation')

      const { executor } = createExecutor(milestone)
      const result = await executor.execute(milestone)

      expect(result.outcome).toBe('completed')
      expect(iterDevMessages.length).toBe(2)
      expect(iterDevMessages[1]).toContain('Login button missing validation')
    })
  })
})
