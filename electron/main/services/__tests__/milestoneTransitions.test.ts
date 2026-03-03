import { describe, it, expect } from 'vitest'
import { validateTransition, availableActions, TRANSITION_TABLE } from '../milestoneTransitions'
import type { MilestoneStatus } from '../../../../src/types/index'
import type { MilestoneAction } from '../milestoneTransitions'

describe('milestoneTransitions', () => {
  describe('validateTransition', () => {
    // ── Legal transitions ──────────────────────────────────────────────────

    it.each([
      ['draft', 'mark_ready', 'ready'],
      ['reviewed', 'approve', 'ready'],
      ['ready', 'cancel', 'cancelled'],
      ['in-progress', 'cancel', 'cancelled'],
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
      ['ready', 'mark_ready'],
      ['ready', 'accept'],
      ['ready', 'rollback'],
      ['ready', 'reopen'],
      ['ready', 'approve'],
      ['ready', 'request_changes'],
      ['in-progress', 'mark_ready'],
      ['in-progress', 'accept'],
      ['in-progress', 'rollback'],
      ['in-progress', 'reopen'],
      ['completed', 'mark_ready'],
      ['completed', 'cancel'],
      ['completed', 'accept'],
      ['completed', 'rollback'],
      ['completed', 'reopen'],
      ['completed', 'approve'],
      ['completed', 'request_changes'],
      ['reviewing', 'mark_ready'],
      ['reviewing', 'cancel'],
      ['reviewed', 'cancel'],
      ['reviewed', 'mark_ready'],
      ['awaiting_review', 'mark_ready'],
      ['awaiting_review', 'cancel'],
      ['awaiting_review', 'reopen'],
      ['cancelled', 'mark_ready'],
      ['cancelled', 'cancel'],
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
    it('returns [mark_ready] for draft', () => {
      expect(availableActions('draft')).toEqual(['mark_ready'])
    })

    it('returns [approve] for reviewed', () => {
      expect(availableActions('reviewed')).toEqual(['approve'])
    })

    it('returns [cancel] for ready', () => {
      expect(availableActions('ready')).toEqual(['cancel'])
    })

    it('returns [cancel] for in-progress', () => {
      expect(availableActions('in-progress')).toEqual(['cancel'])
    })

    it('returns [accept, request_changes, rollback] for awaiting_review', () => {
      expect(availableActions('awaiting_review')).toEqual(['accept', 'request_changes', 'rollback'])
    })

    it('returns [rollback, reopen] for cancelled', () => {
      expect(availableActions('cancelled')).toEqual(['rollback', 'reopen'])
    })

    it('returns [] for completed', () => {
      expect(availableActions('completed')).toEqual([])
    })

    it('returns [] for reviewing', () => {
      expect(availableActions('reviewing')).toEqual([])
    })
  })

  describe('needsScheduler flags', () => {
    it('non-scheduler transitions: mark_ready, approve, reopen', () => {
      const nonScheduler = TRANSITION_TABLE.filter((r) => !r.needsScheduler)
      expect(nonScheduler.map((r) => r.action).sort()).toEqual(['approve', 'mark_ready', 'reopen'])
    })

    it('scheduler transitions: cancel, accept, request_changes, rollback', () => {
      const scheduler = TRANSITION_TABLE.filter((r) => r.needsScheduler)
      const actions = [...new Set(scheduler.map((r) => r.action))].sort()
      expect(actions).toEqual(['accept', 'cancel', 'request_changes', 'rollback'])
    })
  })
})
