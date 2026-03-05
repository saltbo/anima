import { describe, it, expect } from 'vitest'
import { validateTransition, availableActions, TRANSITION_TABLE } from '../milestoneTransitions'
import type { MilestoneStatus } from '../../../../src/types/index'
import type { MilestoneAction } from '../milestoneTransitions'

describe('milestoneTransitions', () => {
  describe('validateTransition', () => {
    // ── Legal transitions ──────────────────────────────────────────────────

    it.each([
      ['draft', 'approve', 'planning'],
      ['planning', 'approve', 'planned'],
      ['planned', 'approve', 'ready'],
      ['ready', 'cancel', 'cancelled'],
      ['in_progress', 'cancel', 'cancelled'],
      ['in_progress', 'approve', 'in_review'],
      ['in_review', 'accept', 'completed'],
      ['in_review', 'rollback', 'ready'],
      ['cancelled', 'rollback', 'ready'],
      ['draft', 'close', 'closed'],
      ['planning', 'close', 'closed'],
      ['planned', 'close', 'closed'],
      ['ready', 'close', 'closed'],
      ['in_review', 'close', 'closed'],
      ['cancelled', 'close', 'closed'],
      ['completed', 'close', 'closed'],
      ['closed', 'reopen', 'draft'],
    ] as [MilestoneStatus, MilestoneAction, MilestoneStatus][])(
      '%s + %s → %s',
      (from, action, to) => {
        const result = validateTransition(from, action)
        expect(result).not.toBeNull()
        expect(result!.from).toBe(from)
        expect(result!.to).toBe(to)
        expect(result!.action).toBe(action)
      },
    )

    // ── Illegal transitions ────────────────────────────────────────────────

    it.each([
      ['draft', 'cancel'],
      ['draft', 'accept'],
      ['draft', 'rollback'],
      ['draft', 'reopen'],
      ['draft', 'request_changes'],
      ['planning', 'cancel'],
      ['planning', 'accept'],
      ['planned', 'cancel'],
      ['ready', 'accept'],
      ['ready', 'rollback'],
      ['ready', 'reopen'],
      ['ready', 'approve'],
      ['ready', 'request_changes'],
      ['in_progress', 'accept'],
      ['in_progress', 'rollback'],
      ['in_progress', 'reopen'],
      ['in_progress', 'close'],
      ['in_review', 'cancel'],
      ['in_review', 'reopen'],
      ['in_review', 'request_changes'],
      ['completed', 'cancel'],
      ['completed', 'accept'],
      ['completed', 'rollback'],
      ['completed', 'reopen'],
      ['completed', 'approve'],
      ['completed', 'request_changes'],
      ['cancelled', 'cancel'],
      ['cancelled', 'accept'],
      ['cancelled', 'approve'],
      ['cancelled', 'request_changes'],
      ['closed', 'cancel'],
      ['closed', 'close'],
      ['closed', 'accept'],
      ['closed', 'approve'],
      ['closed', 'rollback'],
    ] as [MilestoneStatus, MilestoneAction][])(
      '%s + %s → null (illegal)',
      (from, action) => {
        expect(validateTransition(from, action)).toBeNull()
      },
    )
  })

  describe('availableActions', () => {
    it('returns [approve, close] for draft', () => {
      expect(availableActions('draft')).toEqual(['approve', 'close'])
    })

    it('returns [approve, close] for planning', () => {
      expect(availableActions('planning')).toEqual(['approve', 'close'])
    })

    it('returns [approve, close] for planned', () => {
      expect(availableActions('planned')).toEqual(['approve', 'close'])
    })

    it('returns [cancel, close] for ready', () => {
      expect(availableActions('ready')).toEqual(['cancel', 'close'])
    })

    it('returns [approve, cancel] for in_progress', () => {
      expect(availableActions('in_progress')).toEqual(['approve', 'cancel'])
    })

    it('returns [accept, rollback, close] for in_review', () => {
      expect(availableActions('in_review')).toEqual(['accept', 'rollback', 'close'])
    })

    it('returns [rollback, close] for cancelled', () => {
      expect(availableActions('cancelled')).toEqual(['rollback', 'close'])
    })

    it('returns [close] for completed', () => {
      expect(availableActions('completed')).toEqual(['close'])
    })

    it('returns [reopen] for closed', () => {
      expect(availableActions('closed')).toEqual(['reopen'])
    })
  })

  describe('needsScheduler flags', () => {
    it('non-scheduler transitions: approve, reopen, close (from draft/planning/planned/cancelled/completed)', () => {
      const nonScheduler = TRANSITION_TABLE.filter((r) => !r.needsScheduler)
      const actions = [...new Set(nonScheduler.map((r) => r.action))].sort()
      expect(actions).toEqual(['approve', 'close', 'reopen'])
    })

    it('scheduler transitions: cancel, close (from ready/in_review), accept, rollback', () => {
      const scheduler = TRANSITION_TABLE.filter((r) => r.needsScheduler)
      const actions = [...new Set(scheduler.map((r) => r.action))].sort()
      expect(actions).toEqual(['accept', 'cancel', 'close', 'rollback'])
    })
  })
})
