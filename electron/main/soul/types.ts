import type { BacklogItem, Milestone, Project } from '../../../src/types/index'

// ── Soul state ───────────────────────────────────────────────────────────────

export type SoulState = 'sleeping' | 'idle' | 'busy'

// ── Pending mention (gathered by sense()) ────────────────────────────────────

export interface PendingMention {
  agentId: string
  milestoneId: string
  commentId: string
}

// ── Soul context (gathered by sense()) ────────────────────────────────────────

export interface SoulContext {
  project: Project | null
  milestones: Milestone[]
  backlogItems: BacklogItem[]
  pendingMentions: PendingMention[]
}

// ── Decisions (returned by think()) ──────────────────────────────────────────

export type Decision =
  | { task: 'idle' }
  | { task: 'dispatch-agent'; agentId: string; milestoneId: string; commentId?: string }
  | { task: 'plan-milestone' }

// ── SoulTask plugin interface ────────────────────────────────────────────────

export interface SoulTask {
  execute(decision: Decision, signal: AbortSignal): Promise<void>
}
