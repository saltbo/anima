import { describe, it, expect } from 'vitest'
import { finalizeAcceptorCriteria } from '../todoCapture'
import type { Milestone } from '../../../../src/types/index'

// ── finalizeAcceptorCriteria ────────────────────────────────────────────────

describe('finalizeAcceptorCriteria', () => {
  const baseMilestone: Milestone = {
    id: 'm-1',
    title: 'Test',
    description: 'Test milestone',
    status: 'in-progress',
    acceptanceCriteria: [],
    tasks: [],
    createdAt: '2026-01-01',
    iterationCount: 0,
    iterations: [],
    totalTokens: 0,
    totalCost: 0,
  }

  it('converts in_progress to rejected for the given iteration', () => {
    const ms = {
      ...baseMilestone,
      acceptanceCriteria: [
        { title: 'A', status: 'in_progress' as const, iteration: 1 },
        { title: 'B', status: 'passed' as const, iteration: 1 },
        { title: 'C', status: 'pending' as const, iteration: 1 },
      ],
    }
    const result = finalizeAcceptorCriteria(ms, 1)

    expect(result).not.toBeNull()
    expect(result!.acceptanceCriteria[0].status).toBe('rejected')
    expect(result!.acceptanceCriteria[1].status).toBe('passed')
    expect(result!.acceptanceCriteria[2].status).toBe('pending')
  })

  it('does not affect other iterations', () => {
    const ms = {
      ...baseMilestone,
      acceptanceCriteria: [
        { title: 'A', status: 'in_progress' as const, iteration: 1 },
        { title: 'B', status: 'in_progress' as const, iteration: 2 },
      ],
    }
    const result = finalizeAcceptorCriteria(ms, 1)

    expect(result).not.toBeNull()
    expect(result!.acceptanceCriteria[0].status).toBe('rejected')
    expect(result!.acceptanceCriteria[1].status).toBe('in_progress') // iteration 2 untouched
  })

  it('returns null when no in_progress items exist', () => {
    const ms = {
      ...baseMilestone,
      acceptanceCriteria: [
        { title: 'A', status: 'passed' as const, iteration: 1 },
        { title: 'B', status: 'rejected' as const, iteration: 1 },
      ],
    }
    expect(finalizeAcceptorCriteria(ms, 1)).toBeNull()
  })
})
