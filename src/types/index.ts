export type ProjectStatus = 'sleeping' | 'checking' | 'awake' | 'paused' | 'rate_limited'

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
  totalTokens: number
  totalCost: number
  rateLimitResetAt: string | null
}

export type InboxItemType = 'idea' | 'bug' | 'feature'
export type InboxItemPriority = 'low' | 'medium' | 'high'
export type InboxItemStatus = 'pending' | 'included' | 'dismissed'

export interface InboxItem {
  id: string
  type: InboxItemType
  title: string
  description?: string
  priority: InboxItemPriority
  status: InboxItemStatus
  createdAt: string
  milestoneId?: string
}

export type MilestoneStatus = 'draft' | 'reviewing' | 'reviewed' | 'ready' | 'in-progress' | 'awaiting_review' | 'completed' | 'cancelled'

export interface MilestoneTask {
  id: string
  title: string
  description?: string
  completed: boolean
  order: number
  iteration: number
}

export type AcceptanceCriterionStatus = 'pending' | 'passed' | 'rejected'

export interface AcceptanceCriterion {
  title: string
  description?: string
  status: AcceptanceCriterionStatus
  iteration: number
}

export interface Milestone {
  id: string
  title: string
  description: string
  status: MilestoneStatus
  acceptanceCriteria: AcceptanceCriterion[]
  tasks: MilestoneTask[]
  createdAt: string
  completedAt?: string
  iterationCount: number
  iterations: Iteration[]
  totalTokens: number
  totalCost: number
  baseCommit?: string
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
  author: 'human' | 'system'
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
