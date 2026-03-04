import { describe, it, expect } from 'vitest'
import { validateTransition, availableActions, TRANSITION_TABLE } from '../milestoneTransitions'
import type { MilestoneStatus } from '../../../../src/types/index'
import type { MilestoneAction } from '../milestoneTransitions'

describe('milestoneTransitions', () => {
  describe('validateTransition', () => {
    // ── Legal transitions ──────────────────────────────────────────────────

    it.each([
      ['reviewed', 'approve', 'ready'],
      ['ready', 'cancel', 'cancelled'],
      ['in-progress', 'cancel', 'cancelled'],
      ['draft', 'close', 'cancelled'],
      ['reviewing', 'close', 'cancelled'],
      ['reviewed', 'close', 'cancelled'],
      ['ready', 'close', 'cancelled'],
      ['in-progress', 'close', 'cancelled'],
      ['awaiting_review', 'close', 'cancelled'],
      ['awaiting_review', 'accept', 'completed'],
      ['awaiting_review', 'request_changes', 'ready'],
      ['awaiting_review', 'rollback', 'ready'],
      ['cancelled', 'rollback', 'ready'],
      ['cancelled', 'reopen', 'draft'],
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
      ['draft', 'completed'],
      ['draft', 'cancel'],
      ['draft', 'accept'],
      ['draft', 'rollback'],
      ['draft', 'reopen'],
      ['draft', 'approve'],
      ['draft', 'request_changes'],
      ['ready', 'accept'],
      ['ready', 'rollback'],
      ['ready', 'reopen'],
      ['ready', 'approve'],
      ['ready', 'request_changes'],
      ['in-progress', 'accept'],
      ['in-progress', 'rollback'],
      ['in-progress', 'reopen'],
      ['completed', 'cancel'],
      ['completed', 'close'],
      ['completed', 'accept'],
      ['completed', 'rollback'],
      ['completed', 'reopen'],
      ['completed', 'approve'],
      ['completed', 'request_changes'],
      ['reviewing', 'cancel'],
      ['reviewed', 'cancel'],
      ['awaiting_review', 'cancel'],
      ['awaiting_review', 'reopen'],
      ['cancelled', 'cancel'],
      ['cancelled', 'close'],
      ['cancelled', 'accept'],
      ['cancelled', 'approve'],
      ['cancelled', 'request_changes'],
    ] as [MilestoneStatus, MilestoneAction][])(
      '%s + %s → null (illegal)',
      (from, action) => {
        expect(validateTransition(from, action)).toBeNull()
      },
    )
  })

  describe('availableActions', () => {
    it('returns [close] for draft', () => {
      expect(availableActions('draft')).toEqual(['close'])
    })

    it('returns [close] for reviewing', () => {
      expect(availableActions('reviewing')).toEqual(['close'])
    })

    it('returns [approve, close] for reviewed', () => {
      expect(availableActions('reviewed')).toEqual(['approve', 'close'])
    })

    it('returns [cancel, close] for ready', () => {
      expect(availableActions('ready')).toEqual(['cancel', 'close'])
    })

    it('returns [cancel, close] for in-progress', () => {
      expect(availableActions('in-progress')).toEqual(['cancel', 'close'])
    })

    it('returns [close, accept, request_changes, rollback] for awaiting_review', () => {
      expect(availableActions('awaiting_review')).toEqual(['close', 'accept', 'request_changes', 'rollback'])
    })

    it('returns [rollback, reopen] for cancelled', () => {
      expect(availableActions('cancelled')).toEqual(['rollback', 'reopen'])
    })

    it('returns [] for completed', () => {
      expect(availableActions('completed')).toEqual([])
    })
  })

  describe('needsScheduler flags', () => {
    it('non-scheduler transitions: approve, reopen, close (from draft/reviewing/reviewed)', () => {
      const nonScheduler = TRANSITION_TABLE.filter((r) => !r.needsScheduler)
      const actions = [...new Set(nonScheduler.map((r) => r.action))].sort()
      expect(actions).toEqual(['approve', 'close', 'reopen'])
    })

    it('scheduler transitions: cancel, close (from ready/in-progress/awaiting_review), accept, request_changes, rollback', () => {
      const scheduler = TRANSITION_TABLE.filter((r) => r.needsScheduler)
      const actions = [...new Set(scheduler.map((r) => r.action))].sort()
      expect(actions).toEqual(['accept', 'cancel', 'close', 'request_changes', 'rollback'])
    })
  })
})
