import type { BacklogItem, Milestone, Project } from '../../../src/types/index'

// ── Soul state ───────────────────────────────────────────────────────────────

export type SoulState = 'sleeping' | 'idle' | 'busy'

// ── Soul context (gathered by sense()) ────────────────────────────────────────

export interface SoulContext {
  project: Project | null
  milestones: Milestone[]
  backlogItems: BacklogItem[]
}

// ── Decisions (returned by think()) ──────────────────────────────────────────

export type Decision =
  | { task: 'idle' }
  | { task: 'execute-milestone'; milestone: Milestone }
  | { task: 'plan-milestone' }

// ── SoulTask plugin interface ────────────────────────────────────────────────

export interface SoulTask {
  execute(decision: Decision, signal: AbortSignal): Promise<void>
}
