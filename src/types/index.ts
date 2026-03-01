export type ProjectStatus = 'sleeping' | 'checking' | 'awake' | 'paused' | 'rate_limited'

export interface Project {
  id: string
  path: string
  name: string
  status: ProjectStatus
  currentMilestone: string | null
  round: number
  nextWakeTime: string | null
  addedAt: string
  totalTokens: number
  totalCost: number
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

export type MilestoneStatus = 'draft' | 'reviewing' | 'reviewed' | 'ready' | 'in-progress' | 'completed'

export interface MilestoneTask {
  id: string
  title: string
  description?: string
  completed: boolean
  order: number
}

export interface Milestone {
  id: string
  title: string
  description: string
  status: MilestoneStatus
  acceptanceCriteria: string[]
  tasks: MilestoneTask[]
  inboxItemIds: string[]
  review?: string
  createdAt: string
  completedAt?: string
}
