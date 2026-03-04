export type ProjectStatus = 'sleeping' | 'idle' | 'busy' | 'paused' | 'rate_limited'

export type IterationOutcome = 'passed' | 'rejected' | 'cancelled' | 'rate_limited' | 'error'

export interface Iteration {
  milestoneId: string
  round: number
  developerSessionId?: string
  acceptorSessionId?: string
  outcome?: IterationOutcome
  startedAt?: string
  completedAt?: string
  totalTokens?: number
  totalCost?: number
  model?: string
}

export interface Project {
  id: string
  path: string
  name: string
  addedAt: string
  status: ProjectStatus
  currentIteration: Iteration | null
  nextWakeTime: string | null
  wakeSchedule: WakeSchedule
  autoMerge: boolean
  autoApprove: boolean
  totalTokens: number
  totalCost: number
  rateLimitResetAt: string | null
}

export type BacklogItemType = 'idea' | 'bug' | 'feature'
export type BacklogItemPriority = 'low' | 'medium' | 'high'
export type BacklogItemStatus = 'todo' | 'in_progress' | 'done' | 'closed'

export interface BacklogItem {
  id: string
  type: BacklogItemType
  title: string
  description?: string
  priority: BacklogItemPriority
  status: BacklogItemStatus
  createdAt: string
}

export type MilestoneStatus = 'draft' | 'reviewing' | 'reviewed' | 'ready' | 'in-progress' | 'awaiting_review' | 'completed' | 'cancelled'

export type MilestoneCheckStatus = 'pending' | 'checking' | 'passed' | 'rejected'

export interface MilestoneCheck {
  id: string
  itemId: string
  title: string
  description?: string
  status: MilestoneCheckStatus
  iteration: number
  createdAt: string
  updatedAt: string
}

export interface Milestone {
  id: string
  title: string
  description: string
  status: MilestoneStatus
  items: BacklogItem[]
  checks: MilestoneCheck[]
  createdAt: string
  completedAt?: string
  iterationCount: number
  iterations: Iteration[]
  totalTokens: number
  totalCost: number
  baseCommit?: string
  assignees: string[]
}

export type WakeScheduleMode = 'manual' | 'interval' | 'times'

export interface WakeSchedule {
  mode: WakeScheduleMode
  intervalMinutes: number | null
  times: string[]
}

export interface MilestoneComment {
  id: string
  milestoneId: string
  body: string
  author: string
  path?: string
  line?: number
  startLine?: number
  commitId?: string
  inReplyToId?: string
  createdAt: string
  updatedAt: string
}

export interface MilestoneGitInfo {
  branch: string
  commitCount: number
  diffStats: { filesChanged: number; insertions: number; deletions: number }
}

// ── Milestone state machine ──────────────────────────────────────────────────

export type MilestoneAction =
  | 'approve'
  | 'cancel'
  | 'close'
  | 'accept'
  | 'request_changes'
  | 'rollback'
  | 'reopen'

export interface TransitionPayload {
  action: MilestoneAction
  comment?: { id: string; body: string }
}
