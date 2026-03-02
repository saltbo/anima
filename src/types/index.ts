export type ProjectStatus = 'sleeping' | 'checking' | 'awake' | 'paused' | 'rate_limited'

export interface Iteration {
  milestoneId: string
  count: number
  developerSessionId?: string
  acceptorSessionId?: string
}

/** Minimal registry entry stored in global config.json */
export interface Project {
  id: string
  path: string
  name: string
  addedAt: string
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

export type MilestoneStatus = 'draft' | 'reviewing' | 'reviewed' | 'ready' | 'in-progress' | 'completed' | 'cancelled'

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
  inboxItemIds: string[]
  review?: string
  createdAt: string
  completedAt?: string
  iterationCount: number
  baseCommit?: string
}

/** Combined Project + ProjectState for UI consumption */
export interface ProjectView extends Project {
  status: ProjectStatus
  currentIteration: Iteration | null
  nextWakeTime: string | null
  totalTokens: number
  totalCost: number
  rateLimitResetAt: string | null
}

export type WakeScheduleMode = 'manual' | 'interval' | 'times'

export interface WakeSchedule {
  mode: WakeScheduleMode
  intervalMinutes: number | null
  times: string[]
}

/** Per-project runtime state stored in .anima/state.json */
export interface ProjectState {
  status: ProjectStatus
  currentIteration: Iteration | null
  nextWakeTime: string | null
  wakeSchedule: WakeSchedule
  totalTokens: number
  totalCost: number
  rateLimitResetAt: string | null
}
