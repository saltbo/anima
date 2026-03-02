import type { Project, InboxItem, Milestone, MilestoneTask, ProjectStatus, WakeSchedule, Iteration } from './index'
import type { AgentEvent } from './agent'

export type AgentRole = 'developer' | 'acceptor'

/** Signals which agent is now active — UI reads content from session file. */
export interface ProjectAgentEvent {
  projectId: string
  role: AgentRole
  agentKey: string
}

export interface ProjectIterationStatus {
  projectId: string
  status: ProjectStatus
  currentIteration: Iteration | null
  rateLimitResetAt: string | null
}

declare global {
  interface Window {
    electronAPI: {
      // ── Projects ─────────────────────────────────────────────────────────
      getProjects: () => Promise<Project[]>
      addProject: () => Promise<Project | null>
      removeProject: (id: string) => Promise<boolean>
      onProjectsUpdated: (callback: (projects: Project[]) => void) => () => void

      // ── Window ───────────────────────────────────────────────────────────
      navigateTo: (path: string) => Promise<void>
      onNavigate: (callback: (path: string) => void) => () => void
      onTriggerAddProject: (callback: () => void) => () => void

      // ── Setup ────────────────────────────────────────────────────────────
      checkProjectSetup: (projectPath: string) => Promise<{ hasVision: boolean; hasSoul: boolean }>
      readSetupFiles: (projectPath: string) => Promise<{ vision: string | null; soul: string | null }>
      writeSetupFile: (projectPath: string, type: 'vision' | 'soul', content: string) => Promise<void>
      startSetupAgent: (id: string, projectPath: string, type: 'init', userContext?: string) => Promise<void>
      listSoulTemplates: () => Promise<Array<{ id: string; name: string; description: string; content: string }>>
      applySoulTemplate: (projectPath: string, templateId: string) => Promise<void>
      startSoulAgent: (id: string, projectPath: string, templateId: string) => Promise<void>

      // ── Agent ────────────────────────────────────────────────────────────
      readAgentEvents: (agentKey: string) => Promise<AgentEvent[]>
      readSessionEvents: (sessionId: string) => Promise<AgentEvent[]>
      sendAgentMessage: (id: string, message: string) => Promise<void>
      stopAgent: (id: string) => Promise<void>
      onAgentEvents: (callback: (agentKey: string, events: AgentEvent[]) => void) => () => void

      // ── Inbox ────────────────────────────────────────────────────────────
      getInboxItems: (projectId: string) => Promise<InboxItem[]>
      addInboxItem: (projectId: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>) => Promise<InboxItem>
      updateInboxItem: (projectId: string, id: string, patch: Partial<InboxItem>) => Promise<InboxItem | null>
      deleteInboxItem: (projectId: string, id: string) => Promise<void>

      // ── Milestones ───────────────────────────────────────────────────────
      getMilestones: (projectId: string) => Promise<Milestone[]>
      saveMilestone: (projectId: string, milestone: Milestone) => Promise<void>
      deleteMilestone: (projectId: string, id: string) => Promise<void>
      updateMilestoneTask: (projectId: string, milestoneId: string, taskId: string, patch: Partial<MilestoneTask>) => Promise<void>
      readMilestoneMarkdown: (projectId: string, id: string) => Promise<string | null>
      writeMilestoneMarkdown: (projectId: string, id: string, content: string) => Promise<void>
      startMilestonePlanning: (id: string, projectId: string, inboxItemIds: string[], title: string, description: string) => Promise<void>
      onMilestonePlanningDone: (callback: (planningId: string, milestoneId: string) => void) => () => void
      onMilestoneReviewDone: (callback: (milestoneId: string) => void) => () => void
      onMilestoneUpdated: (callback: (data: { projectId: string; milestone: Milestone }) => void) => () => void
      onMilestoneCompleted: (callback: (data: { projectId: string; milestoneId: string }) => void) => () => void

      // ── Project / Scheduler ──────────────────────────────────────────────
      wakeProject: (projectId: string) => Promise<void>
      updateWakeSchedule: (projectId: string, schedule: WakeSchedule) => Promise<void>
      cancelMilestone: (projectId: string, milestoneId: string) => Promise<void>
      onProjectStatusChanged: (callback: (status: ProjectIterationStatus) => void) => () => void
      onProjectAgentEvent: (callback: (data: ProjectAgentEvent) => void) => () => void
      onIterationPaused: (callback: (data: { projectId: string; milestoneId: string; reason: string }) => void) => () => void
      onRateLimited: (callback: (data: { projectId: string; resetAt: string }) => void) => () => void
    }
  }
}
