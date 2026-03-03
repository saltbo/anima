import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { think } from '../decide'
import type { SoulContext } from '../types'
import type { Project, Milestone } from '../../../../src/types/index'
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
    acceptanceCriteria: [],
    tasks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    iterationCount: 0,
    iterations: [],
    totalTokens: 0,
    totalCost: 0,
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
    const ctx: SoulContext = { project: null, milestones: [] }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when no milestones are ready or in-progress', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [
        makeMilestone({ status: 'draft' }),
        makeMilestone({ id: 'm2', status: 'completed' }),
      ],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle when rate limited with future reset time', () => {
    const resetAt = dayjs().add(30, 'minute').toISOString()
    const ctx: SoulContext = {
      project: makeProject({ rateLimitResetAt: resetAt }),
      milestones: [makeMilestone({ status: 'ready' })],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns execute-milestone for a ready milestone when rate limit has expired', () => {
    const resetAt = dayjs().subtract(5, 'minute').toISOString()
    const milestone = makeMilestone({ status: 'ready' })
    const ctx: SoulContext = {
      project: makeProject({ rateLimitResetAt: resetAt }),
      milestones: [milestone],
    }
    expect(think(ctx)).toEqual({ task: 'execute-milestone', milestone })
  })

  it('returns execute-milestone for a ready milestone', () => {
    const milestone = makeMilestone({ status: 'ready' })
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [makeMilestone({ id: 'm0', status: 'draft' }), milestone],
    }
    expect(think(ctx)).toEqual({ task: 'execute-milestone', milestone })
  })

  it('prefers in-progress over ready milestone', () => {
    const inProgress = makeMilestone({ id: 'm1', status: 'in-progress' })
    const ready = makeMilestone({ id: 'm2', status: 'ready' })
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [ready, inProgress],
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
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })

  it('returns idle with empty milestones array', () => {
    const ctx: SoulContext = {
      project: makeProject(),
      milestones: [],
    }
    expect(think(ctx)).toEqual({ task: 'idle' })
  })
})
