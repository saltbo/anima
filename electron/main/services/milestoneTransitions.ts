import type { MilestoneStatus } from '../../../src/types/index'

// ── Actions ──────────────────────────────────────────────────────────────────

export type MilestoneAction =
  | 'approve'
  | 'cancel'
  | 'close'
  | 'accept'
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
  // Planning phase
  { action: 'approve',          from: 'draft',           to: 'planning',  needsScheduler: false },
  { action: 'approve',          from: 'planning',        to: 'planned',   needsScheduler: false },
  { action: 'approve',          from: 'planned',         to: 'ready',     needsScheduler: false },
  // Execution phase
  { action: 'approve',          from: 'in_progress',     to: 'in_review', needsScheduler: false },
  { action: 'cancel',           from: 'ready',           to: 'cancelled', needsScheduler: true  },
  { action: 'cancel',           from: 'in_progress',     to: 'cancelled', needsScheduler: true  },
  { action: 'accept',           from: 'in_review',       to: 'completed', needsScheduler: true  },
  { action: 'rollback',         from: 'in_review',       to: 'ready',     needsScheduler: true  },
  { action: 'rollback',         from: 'cancelled',       to: 'ready',     needsScheduler: true  },
  // Close (→ closed)
  { action: 'close',            from: 'draft',           to: 'closed',    needsScheduler: false },
  { action: 'close',            from: 'planning',        to: 'closed',    needsScheduler: false },
  { action: 'close',            from: 'planned',         to: 'closed',    needsScheduler: false },
  { action: 'close',            from: 'ready',           to: 'closed',    needsScheduler: true  },
  { action: 'close',            from: 'in_review',       to: 'closed',    needsScheduler: true  },
  { action: 'close',            from: 'cancelled',       to: 'closed',    needsScheduler: false },
  { action: 'close',            from: 'completed',       to: 'closed',    needsScheduler: false },
  // Reopen
  { action: 'reopen',           from: 'closed',          to: 'draft',     needsScheduler: false },
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
