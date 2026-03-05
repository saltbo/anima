import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { think } from '../decide'
import type { SoulContext } from '../types'
import type { Project, Milestone, BacklogItem } from '../../../../src/types/index'
import dayjs from 'dayjs'

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

function makeBacklogItem(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: 'b1',
    type: 'feature',
    title: 'Test backlog item',
    priority: 'medium',
    status: 'todo',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeContext(overrides: Partial<SoulContext> = {}): SoulContext {
  return {
    project: makeProject(),
    milestones: [],
    backlogItems: [],
    pendingMentions: [],
    planningDispatchCounts: {},
    ...overrides,
  }
}

describe('think()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns idle when project is null', () => {
    expect(think(makeContext({ project: null }))).toEqual({ task: 'idle' })
  })

  it('returns idle when no milestones are ready or in_progress', () => {
    const ctx = makeContext({
      milestones: [
        makeMilestone({ status: 'draft' }),
        makeMilestone({ id: 'm2', status: 'completed' }),
      ],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when rate limited with future reset time', () => {
    const resetAt = dayjs().add(30, 'minute').toISOString()
    const ctx = makeContext({
      project: makeProject({ rateLimitResetAt: resetAt }),
      milestones: [makeMilestone({ status: 'ready' })],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('dispatches developer for a ready milestone when rate limit has expired', () => {
    const resetAt = dayjs().subtract(5, 'minute').toISOString()
    const milestone = makeMilestone({ status: 'ready' })
    const ctx = makeContext({
      project: makeProject({ rateLimitResetAt: resetAt }),
      milestones: [milestone],
    })
    expect(think(ctx)).toEqual({ task: 'dispatch-agent', agentId: 'developer', milestoneId: 'm1' })
  })

  it('dispatches developer for a ready milestone', () => {
    const milestone = makeMilestone({ status: 'ready' })
    const ctx = makeContext({
      milestones: [makeMilestone({ id: 'm0', status: 'draft' }), milestone],
    })
    expect(think(ctx)).toEqual({ task: 'dispatch-agent', agentId: 'developer', milestoneId: 'm1' })
  })

  it('dispatches mentioned agent for in_progress milestone', () => {
    const inProgress = makeMilestone({ id: 'm1', status: 'in_progress' })
    const ctx = makeContext({
      milestones: [inProgress],
      pendingMentions: [{ agentId: 'reviewer', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({
      task: 'dispatch-agent', agentId: 'reviewer', milestoneId: 'm1', commentId: 'c1',
    })
  })

  it('prefers in_progress with mentions over ready milestone', () => {
    const inProgress = makeMilestone({ id: 'm1', status: 'in_progress' })
    const ready = makeMilestone({ id: 'm2', status: 'ready' })
    const ctx = makeContext({
      milestones: [ready, inProgress],
      pendingMentions: [{ agentId: 'developer', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({
      task: 'dispatch-agent', agentId: 'developer', milestoneId: 'm1', commentId: 'c1',
    })
  })

  it('returns idle when @human mention on in_progress milestone', () => {
    const inProgress = makeMilestone({ id: 'm1', status: 'in_progress' })
    const ctx = makeContext({
      milestones: [inProgress],
      pendingMentions: [{ agentId: 'human', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when dispatch_count exceeds limit', () => {
    const inProgress = makeMilestone({
      id: 'm1',
      status: 'in_progress',
      iterations: [{ milestoneId: 'm1', round: 1, status: 'in_progress', dispatchCount: 10 }],
    })
    const ctx = makeContext({
      milestones: [inProgress],
      pendingMentions: [{ agentId: 'developer', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when in_progress milestone has no mentions and no passed iteration', () => {
    const inProgress = makeMilestone({ id: 'm1', status: 'in_progress' })
    const ctx = makeContext({
      milestones: [inProgress],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when all milestones are completed or cancelled', () => {
    const ctx = makeContext({
      milestones: [
        makeMilestone({ id: 'm1', status: 'completed' }),
        makeMilestone({ id: 'm2', status: 'cancelled' }),
        makeMilestone({ id: 'm3', status: 'in_review' }),
      ],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('dispatches mentioned agent for in_review milestone', () => {
    const inReview = makeMilestone({ id: 'm1', status: 'in_review' })
    const ctx = makeContext({
      milestones: [inReview],
      pendingMentions: [{ agentId: 'developer', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({
      task: 'dispatch-agent', agentId: 'developer', milestoneId: 'm1', commentId: 'c1',
    })
  })

  it('returns idle when @human mention on in_review milestone', () => {
    const inReview = makeMilestone({ id: 'm1', status: 'in_review' })
    const ctx = makeContext({
      milestones: [inReview],
      pendingMentions: [{ agentId: 'human', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when in_review milestone has no mentions', () => {
    const inReview = makeMilestone({ id: 'm1', status: 'in_review' })
    const ctx = makeContext({
      milestones: [inReview],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle with empty milestones array', () => {
    expect(think(makeContext())).toEqual({ task: 'idle' })
  })

  // ── plan-milestone tests ────────────────────────────────────────────────

  it('returns plan-milestone when 10+ todo backlog items and no active milestones', () => {
    const backlogItems = Array.from({ length: 10 }, (_, i) =>
      makeBacklogItem({ id: `b${i}`, title: `Item ${i}` })
    )
    expect(think(makeContext({ backlogItems }))).toEqual({ task: 'plan-milestone' })
  })

  it('returns plan-milestone when 1 todo backlog item and no completed milestones ever', () => {
    expect(think(makeContext({ backlogItems: [makeBacklogItem()] }))).toEqual({ task: 'plan-milestone' })
  })

  it('returns plan-milestone when 1 todo backlog item and last milestone completed >30 days ago', () => {
    const completedAt = dayjs().subtract(31, 'day').toISOString()
    const ctx = makeContext({
      milestones: [makeMilestone({ id: 'm1', status: 'completed', completedAt })],
      backlogItems: [makeBacklogItem()],
    })
    expect(think(ctx)).toEqual({ task: 'plan-milestone' })
  })

  it('returns idle when 1 todo backlog item and last milestone completed <30 days ago', () => {
    const completedAt = dayjs().subtract(10, 'day').toISOString()
    const ctx = makeContext({
      milestones: [makeMilestone({ id: 'm1', status: 'completed', completedAt })],
      backlogItems: [makeBacklogItem()],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when todo backlog items exist but draft milestone is pending', () => {
    const backlogItems = Array.from({ length: 15 }, (_, i) =>
      makeBacklogItem({ id: `b${i}`, title: `Item ${i}` })
    )
    const ctx = makeContext({
      milestones: [makeMilestone({ status: 'draft' })],
      backlogItems,
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when todo backlog items exist but planning milestone is pending', () => {
    const ctx = makeContext({
      milestones: [makeMilestone({ status: 'planning' })],
      backlogItems: [makeBacklogItem()],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when no todo backlog items', () => {
    const ctx = makeContext({
      backlogItems: [makeBacklogItem({ status: 'done' })],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  // ── iteration passed → dispatch developer for new iteration ────────────

  it('dispatches developer when iteration passed but checks remain', () => {
    const inProgress = makeMilestone({
      id: 'm1',
      status: 'in_progress',
      checks: [
        { id: 'c1', milestoneId: 'm1', itemId: 'i1', title: 'A', status: 'passed', iteration: 1, createdAt: '', updatedAt: '' },
        { id: 'c2', milestoneId: 'm1', itemId: 'i1', title: 'B', status: 'pending', iteration: 0, createdAt: '', updatedAt: '' },
      ],
      iterations: [{ milestoneId: 'm1', round: 1, status: 'passed', outcome: 'passed' }],
    })
    const ctx = makeContext({
      milestones: [inProgress],
    })
    expect(think(ctx)).toEqual({ task: 'dispatch-agent', agentId: 'developer', milestoneId: 'm1' })
  })

  // ── planning-phase dispatch tests ──────────────────────────────────────

  it('dispatches reviewer for planning milestone with @reviewer mention', () => {
    const planning = makeMilestone({ id: 'm1', status: 'planning' })
    const ctx = makeContext({
      milestones: [planning],
      pendingMentions: [{ agentId: 'reviewer', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({
      task: 'dispatch-agent', agentId: 'reviewer', milestoneId: 'm1', commentId: 'c1',
    })
  })

  it('dispatches planner for planning milestone with @planner mention', () => {
    const planning = makeMilestone({ id: 'm1', status: 'planning' })
    const ctx = makeContext({
      milestones: [planning],
      pendingMentions: [{ agentId: 'planner', milestoneId: 'm1', commentId: 'c2' }],
    })
    expect(think(ctx)).toEqual({
      task: 'dispatch-agent', agentId: 'planner', milestoneId: 'm1', commentId: 'c2',
    })
  })

  it('returns idle when @human mention on planning milestone', () => {
    const planning = makeMilestone({ id: 'm1', status: 'planning' })
    const ctx = makeContext({
      milestones: [planning],
      pendingMentions: [{ agentId: 'human', milestoneId: 'm1', commentId: 'c1' }],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when planning milestone has no mentions', () => {
    const planning = makeMilestone({ id: 'm1', status: 'planning' })
    const ctx = makeContext({
      milestones: [planning],
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when planning dispatch count exceeds limit', () => {
    const planning = makeMilestone({ id: 'm1', status: 'planning' })
    const ctx = makeContext({
      milestones: [planning],
      pendingMentions: [{ agentId: 'reviewer', milestoneId: 'm1', commentId: 'c1' }],
      planningDispatchCounts: { m1: 5 },
    })
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('prefers in_progress over planning milestone', () => {
    const inProgress = makeMilestone({
      id: 'm1',
      status: 'in_progress',
    })
    const planning = makeMilestone({ id: 'm2', status: 'planning' })
    const ctx = makeContext({
      milestones: [planning, inProgress],
      pendingMentions: [
        { agentId: 'developer', milestoneId: 'm1', commentId: 'c1' },
        { agentId: 'reviewer', milestoneId: 'm2', commentId: 'c2' },
      ],
    })
    expect(think(ctx)).toEqual({
      task: 'dispatch-agent', agentId: 'developer', milestoneId: 'm1', commentId: 'c1',
    })
  })
})
