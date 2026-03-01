import type { Project, InboxItem, Milestone, MilestoneTask, ProjectState, WakeSchedule } from './index'

export type SetupChatData =
  | { event: 'text'; text: string }
  | { event: 'thinking'; thinking: string }
  | { event: 'tool_use'; toolName: string; toolInput: string; toolCallId: string }
  | { event: 'tool_result'; toolCallId: string; content: string; isError: boolean }
  | { event: 'system'; model: string; sessionId: string }
  | { event: 'rate_limit'; utilization: number }
  | { event: 'done'; result?: string }
  | { event: 'error'; message: string }

export type AgentRole = 'developer' | 'acceptor'

export interface IterationAgentEvent {
  projectId: string
  role: AgentRole
  sessionId: string
  event: SetupChatData
}

export interface ProjectIterationStatus {
  projectId: string
  status: ProjectState['status']
  currentMilestone: string | null
  iterationCount: number
  round: number
  rateLimitResetAt: string | null
}

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<Project[]>
      addProject: () => Promise<Project | null>
      removeProject: (id: string) => Promise<boolean>
      navigateTo: (path: string) => Promise<void>

      checkProjectSetup: (projectPath: string) => Promise<{ hasVision: boolean; hasSoul: boolean }>
      readSetupFiles: (projectPath: string) => Promise<{ vision: string | null; soul: string | null }>
      startSetupSession: (id: string, projectPath: string, type: 'vision' | 'soul' | 'init') => Promise<void>
      sendAgentMessage: (id: string, message: string) => Promise<void>
      stopAgentSession: (id: string) => Promise<void>
      writeSetupFile: (projectPath: string, type: 'vision' | 'soul', content: string) => Promise<void>

      onProjectsUpdated: (callback: (projects: Project[]) => void) => () => void
      onNavigate: (callback: (path: string) => void) => () => void
      onTriggerAddProject: (callback: () => void) => () => void
      onSetupChatData: (callback: (id: string, data: SetupChatData) => void) => () => void

      getInboxItems: (projectPath: string) => Promise<InboxItem[]>
      addInboxItem: (projectPath: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>) => Promise<InboxItem>
      updateInboxItem: (projectPath: string, id: string, patch: Partial<InboxItem>) => Promise<InboxItem | null>
      deleteInboxItem: (projectPath: string, id: string) => Promise<void>
      getMilestones: (projectPath: string) => Promise<Milestone[]>
      saveMilestone: (projectPath: string, milestone: Milestone) => Promise<void>
      deleteMilestone: (projectPath: string, id: string) => Promise<void>
      updateMilestoneTask: (projectPath: string, milestoneId: string, taskId: string, patch: Partial<MilestoneTask>) => Promise<void>
      writeMilestoneMarkdown: (projectPath: string, id: string, content: string) => Promise<void>
      readMilestoneMarkdown: (projectPath: string, id: string) => Promise<string | null>
      startMilestonePlanningSession: (id: string, projectPath: string, inboxItemIds: string[], title: string, description: string) => Promise<void>

      onMilestonePlanningDone: (callback: (sessionId: string, milestoneId: string) => void) => () => void
      onMilestoneReviewDone: (callback: (milestoneId: string) => void) => () => void

      // M4
      getProjectState: (projectPath: string) => Promise<ProjectState>
      wakeProject: (projectId: string) => Promise<void>
      updateWakeSchedule: (projectId: string, projectPath: string, schedule: WakeSchedule) => Promise<void>

      onProjectStatusChanged: (callback: (status: ProjectIterationStatus) => void) => () => void
      onIterationAgentEvent: (callback: (data: IterationAgentEvent) => void) => () => void
      onMilestoneUpdated: (callback: (data: { projectId: string; milestone: Milestone }) => void) => () => void
      onMilestoneCompleted: (callback: (data: { projectId: string; milestoneId: string }) => void) => () => void
      onIterationPaused: (callback: (data: { projectId: string; milestoneId: string; reason: string }) => void) => () => void
      onRateLimited: (callback: (data: { projectId: string; resetAt: string }) => void) => () => void
    }
  }
}
