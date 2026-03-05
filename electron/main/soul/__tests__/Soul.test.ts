import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Soul } from '../Soul'
import type { SoulTask, Decision } from '../types'
import type { Project, Milestone } from '../../../../src/types/index'

// ── Mocks ────────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    path: '/tmp/project',
    name: 'Test Project',
    addedAt: '2026-01-01T00:00:00.000Z',
    status: 'sleeping',
    currentIteration: null,
    nextWakeTime: null,
    wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
    autoMerge: false,
    autoApprove: false,
    totalTokens: 0,
    totalCost: 0,
    rateLimitResetAt: null,
    ...overrides,
  }
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm1',
    title: 'Test Milestone',
    description: 'Test description',
    status: 'draft',
    items: [],
    checks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    iterationCount: 0,
    iterations: [],
    totalTokens: 0,
    totalCost: 0,
    assignees: [],
    ...overrides,
  }
}

function createMockRepos(project: Project, milestones: Milestone[]) {
  return {
    projectRepo: {
      getById: vi.fn().mockReturnValue(project),
      patch: vi.fn(),
      getAll: vi.fn().mockReturnValue([project]),
    },
    milestoneRepo: {
      getByProjectId: vi.fn().mockReturnValue(milestones),
      getById: vi.fn((id: string) => milestones.find((m) => m.id === id) ?? null),
      save: vi.fn(),
    },
    backlogRepo: {
      getByProjectId: vi.fn().mockReturnValue([]),
    },
    commentRepo: {
      getUndispatchedMentions: vi.fn().mockReturnValue([]),
      markMentionDispatched: vi.fn(),
      getByMilestoneId: vi.fn().mockReturnValue([]),
    },
  }
}

function createSoul(repos: ReturnType<typeof createMockRepos>) {
  return new Soul({
    projectId: 'p1',
    projectPath: '/tmp/project',
    getWindow: () => null,
    projectRepo: repos.projectRepo as never,
    milestoneRepo: repos.milestoneRepo as never,
    backlogRepo: repos.backlogRepo as never,
    commentRepo: repos.commentRepo as never,
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Soul', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in sleeping state', () => {
    const project = makeProject()
    const repos = createMockRepos(project, [])
    const soul = createSoul(repos)

    expect(soul.getState()).toBe('sleeping')
    soul.destroy()
  })

  it('transitions to idle on wake()', async () => {
    const project = makeProject()
    const repos = createMockRepos(project, [])
    const soul = createSoul(repos)

    soul.wake()
    // wake() sets state to idle immediately; tick is deferred
    expect(soul.getState()).toBe('idle')

    // Let deferred tick run (no work → stays idle)
    await vi.advanceTimersByTimeAsync(0)
    expect(soul.getState()).toBe('idle')
    soul.destroy()
  })

  it('dispatches to registered task when ready milestone exists', async () => {
    const readyMilestone = makeMilestone({ status: 'ready' })
    const project = makeProject()
    const repos = createMockRepos(project, [readyMilestone])

    const mockTask: SoulTask = {
      execute: vi.fn().mockResolvedValue(undefined),
    }

    const soul = createSoul(repos)
    soul.register('dispatch-agent', mockTask)
    soul.wake()

    // Allow tick + async act to complete
    await vi.advanceTimersByTimeAsync(0)

    expect(mockTask.execute).toHaveBeenCalledOnce()
    const callArgs = (mockTask.execute as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[0]).toEqual({ task: 'dispatch-agent', agentId: 'developer', milestoneId: 'm1' })
    expect(callArgs[1]).toBeInstanceOf(AbortSignal)

    soul.destroy()
  })

  it('does not dispatch when no work available', async () => {
    const project = makeProject()
    const repos = createMockRepos(project, [makeMilestone({ status: 'draft' })])

    const mockTask: SoulTask = {
      execute: vi.fn().mockResolvedValue(undefined),
    }

    const soul = createSoul(repos)
    soul.register('dispatch-agent', mockTask)
    soul.wake()

    // Let deferred tick run
    await vi.advanceTimersByTimeAsync(0)

    expect(mockTask.execute).not.toHaveBeenCalled()
    expect(soul.getState()).toBe('idle')

    soul.destroy()
  })

  it('returns to idle after task completes', async () => {
    const readyMilestone = makeMilestone({ status: 'ready' })
    const project = makeProject()
    const repos = createMockRepos(project, [readyMilestone])

    const mockTask: SoulTask = {
      execute: vi.fn().mockResolvedValue(undefined),
    }

    const soul = createSoul(repos)
    soul.register('dispatch-agent', mockTask)
    soul.wake()

    await vi.advanceTimersByTimeAsync(0)

    expect(soul.getState()).toBe('idle')
    soul.destroy()
  })

  it('abort() cancels running task and returns to idle', async () => {
    const readyMilestone = makeMilestone({ status: 'ready' })
    const project = makeProject()
    const repos = createMockRepos(project, [readyMilestone])

    let capturedSignal: AbortSignal | undefined
    const mockTask: SoulTask = {
      execute: vi.fn().mockImplementation(async (_d: Decision, signal: AbortSignal) => {
        capturedSignal = signal
        // Simulate long-running task
        await new Promise((resolve) => setTimeout(resolve, 100_000))
      }),
    }

    const soul = createSoul(repos)
    soul.register('dispatch-agent', mockTask)
    soul.wake()

    // Let the task start
    await vi.advanceTimersByTimeAsync(0)

    soul.abort()
    expect(capturedSignal?.aborted).toBe(true)
    expect(soul.getState()).toBe('idle')

    soul.destroy()
  })

  it('sleep() stops heartbeat', async () => {
    const project = makeProject()
    const repos = createMockRepos(project, [])
    const soul = createSoul(repos)

    soul.wake()
    expect(soul.getState()).toBe('idle')

    soul.sleep()
    expect(soul.getState()).toBe('sleeping')

    // Advance past the deferred tick — should NOT execute since sleep cancelled it
    await vi.advanceTimersByTimeAsync(0)
    expect(soul.getState()).toBe('sleeping')

    soul.destroy()
  })

  it('heartbeat ticks at regular intervals', async () => {
    const project = makeProject()
    const repos = createMockRepos(project, [])
    const soul = createSoul(repos)

    soul.wake()

    // Let the deferred first tick run — it calls sense() via getByProjectId
    await vi.advanceTimersByTimeAsync(0)
    const initialCalls = repos.milestoneRepo.getByProjectId.mock.calls.length

    // Advance by one heartbeat interval (60s)
    // Note: without wakeRequested or scheduled wake, tick skips.
    // But we already consumed wakeRequested in the initial tick.
    // So next tick should not call sense() unless scheduled.
    await vi.advanceTimersByTimeAsync(60_000)

    // No additional calls since wakeRequested was consumed and no schedule set
    expect(repos.milestoneRepo.getByProjectId.mock.calls.length).toBe(initialCalls)

    soul.destroy()
  })

  it('collects pending mentions from in_progress milestones', async () => {
    const inProgressMilestone = makeMilestone({ id: 'm1', status: 'in_progress' })
    const project = makeProject()
    const repos = createMockRepos(project, [inProgressMilestone])

    // Mock undispatched mentions
    repos.commentRepo.getUndispatchedMentions.mockReturnValue([
      {
        id: 'c1', milestoneId: 'm1', body: '@reviewer please review',
        author: 'developer', createdAt: '2026-03-01T12:00:00Z', updatedAt: '2026-03-01T12:00:00Z',
      },
    ])

    const mockTask: SoulTask = {
      execute: vi.fn().mockResolvedValue(undefined),
    }

    const soul = createSoul(repos)
    soul.register('dispatch-agent', mockTask)
    soul.wake()

    await vi.advanceTimersByTimeAsync(0)

    expect(mockTask.execute).toHaveBeenCalledOnce()
    const callArgs = (mockTask.execute as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[0]).toEqual({
      task: 'dispatch-agent', agentId: 'reviewer', milestoneId: 'm1', commentId: 'c1',
    })

    soul.destroy()
  })
})
