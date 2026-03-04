import type { MilestoneStatus } from '../../../src/types/index'

// ── Actions ──────────────────────────────────────────────────────────────────

export type MilestoneAction =
  | 'approve'
  | 'cancel'
  | 'close'
  | 'accept'
  | 'request_changes'
  | 'rollback'
  | 'reopen'

// ── Transition table ─────────────────────────────────────────────────────────

export interface TransitionRule {
  action: MilestoneAction
  from: MilestoneStatus
  to: MilestoneStatus
  needsScheduler: boolean
}

export const TRANSITION_TABLE: readonly TransitionRule[] = [
  // User-initiated via milestones:transition IPC
  { action: 'approve',          from: 'reviewed',        to: 'ready',     needsScheduler: false },
  { action: 'cancel',           from: 'ready',           to: 'cancelled', needsScheduler: true  },
  { action: 'cancel',           from: 'in-progress',     to: 'cancelled', needsScheduler: true  },
  { action: 'close',            from: 'draft',           to: 'cancelled', needsScheduler: false },
  { action: 'close',            from: 'reviewing',       to: 'cancelled', needsScheduler: false },
  { action: 'close',            from: 'reviewed',        to: 'cancelled', needsScheduler: false },
  { action: 'close',            from: 'ready',           to: 'cancelled', needsScheduler: true  },
  { action: 'close',            from: 'in-progress',     to: 'cancelled', needsScheduler: true  },
  { action: 'close',            from: 'awaiting_review', to: 'cancelled', needsScheduler: true  },
  { action: 'accept',           from: 'awaiting_review', to: 'completed', needsScheduler: true  },
  { action: 'request_changes',  from: 'awaiting_review', to: 'ready',     needsScheduler: true  },
  { action: 'rollback',         from: 'awaiting_review', to: 'ready',     needsScheduler: true  },
  { action: 'rollback',         from: 'cancelled',       to: 'ready',     needsScheduler: true  },
  { action: 'reopen',           from: 'cancelled',       to: 'draft',     needsScheduler: false },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export interface ValidatedTransition {
  action: MilestoneAction
  from: MilestoneStatus
  to: MilestoneStatus
  needsScheduler: boolean
}

export function validateTransition(
  currentStatus: MilestoneStatus,
  action: MilestoneAction,
): ValidatedTransition | null {
  const rule = TRANSITION_TABLE.find((r) => r.action === action && r.from === currentStatus)
  return rule ?? null
}

export function availableActions(status: MilestoneStatus): MilestoneAction[] {
  return TRANSITION_TABLE.filter((r) => r.from === status).map((r) => r.action)
}
