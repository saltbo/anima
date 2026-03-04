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

describe('think()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns idle when project is null', () => {
    const ctx: SoulContext = { project: null, milestones: [], backlogItems: [] }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when no milestones are ready or in-progress', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [
        makeMilestone({ status: 'draft' }),
        makeMilestone({ id: 'm2', status: 'completed' }),
      ],
      backlogItems: [],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when rate limited with future reset time', () => {
    const resetAt = dayjs().add(30, 'minute').toISOString()
    const ctx: SoulContext = {
      project: makeProject({ rateLimitResetAt: resetAt }),
      milestones: [makeMilestone({ status: 'ready' })],
      backlogItems: [],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns execute-milestone for a ready milestone when rate limit has expired', () => {
    const resetAt = dayjs().subtract(5, 'minute').toISOString()
    const milestone = makeMilestone({ status: 'ready' })
    const ctx: SoulContext = {
      project: makeProject({ rateLimitResetAt: resetAt }),
      milestones: [milestone],
      backlogItems: [],
    }
    expect(think(ctx)).toEqual({ task: 'execute-milestone', milestone })
  })

  it('returns execute-milestone for a ready milestone', () => {
    const milestone = makeMilestone({ status: 'ready' })
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [makeMilestone({ id: 'm0', status: 'draft' }), milestone],
      backlogItems: [],
    }
    expect(think(ctx)).toEqual({ task: 'execute-milestone', milestone })
  })

  it('prefers in-progress over ready milestone', () => {
    const inProgress = makeMilestone({ id: 'm1', status: 'in-progress' })
    const ready = makeMilestone({ id: 'm2', status: 'ready' })
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [ready, inProgress],
      backlogItems: [],
    }
    expect(think(ctx)).toEqual({ task: 'execute-milestone', milestone: inProgress })
  })

  it('returns idle when all milestones are completed or cancelled', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [
        makeMilestone({ id: 'm1', status: 'completed' }),
        makeMilestone({ id: 'm2', status: 'cancelled' }),
        makeMilestone({ id: 'm3', status: 'awaiting_review' }),
      ],
      backlogItems: [],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle with empty milestones array', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [],
      backlogItems: [],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  // ── plan-milestone tests ────────────────────────────────────────────────

  it('returns plan-milestone when 10+ todo backlog items and no active milestones', () => {
    const backlogItems = Array.from({ length: 10 }, (_, i) =>
      makeBacklogItem({ id: `b${i}`, title: `Item ${i}` })
    )
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [],
      backlogItems,
    }
    expect(think(ctx)).toEqual({ task: 'plan-milestone' })
  })

  it('returns plan-milestone when 1 todo backlog item and no completed milestones ever', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [],
      backlogItems: [makeBacklogItem()],
    }
    expect(think(ctx)).toEqual({ task: 'plan-milestone' })
  })

  it('returns plan-milestone when 1 todo backlog item and last milestone completed >30 days ago', () => {
    const completedAt = dayjs().subtract(31, 'day').toISOString()
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [makeMilestone({ id: 'm1', status: 'completed', completedAt })],
      backlogItems: [makeBacklogItem()],
    }
    expect(think(ctx)).toEqual({ task: 'plan-milestone' })
  })

  it('returns idle when 1 todo backlog item and last milestone completed <30 days ago', () => {
    const completedAt = dayjs().subtract(10, 'day').toISOString()
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [makeMilestone({ id: 'm1', status: 'completed', completedAt })],
      backlogItems: [makeBacklogItem()],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when todo backlog items exist but draft milestone is pending', () => {
    const backlogItems = Array.from({ length: 15 }, (_, i) =>
      makeBacklogItem({ id: `b${i}`, title: `Item ${i}` })
    )
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [makeMilestone({ status: 'draft' })],
      backlogItems,
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when todo backlog items exist but reviewing milestone is pending', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [makeMilestone({ status: 'reviewing' })],
      backlogItems: [makeBacklogItem()],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when no todo backlog items', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [],
      backlogItems: [makeBacklogItem({ status: 'done' })],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })
})
