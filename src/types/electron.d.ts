import type { Project, BacklogItem, Milestone, ProjectStatus, WakeSchedule, Iteration, MilestoneComment, MilestoneGitInfo, TransitionPayload, Action } from './index'
import type { AgentEvent } from './agent'

export type UpdaterStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'up-to-date' }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; error: string }

export type AgentRole = 'developer' | 'reviewer'

export interface McpServerEntry {
  command: string
  args: string[]
  env?: Record<string, string>
}

/** Signals which agent is now active — UI reads content from session file. */
export interface ProjectAgentEvent {
  projectId: string
  role: AgentRole
  sessionId: string
}

export interface ProjectIterationStatus {
  projectId: string
  status: ProjectStatus
  currentIteration: Iteration | null
  rateLimitResetAt: string | null
}

declare const __APP_VERSION__: string

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
      checkProjectSetup: (projectPath: string) => Promise<{ hasSoul: boolean }>
      readSetupFiles: (projectPath: string) => Promise<{ soul: string | null }>
      writeSetupFile: (projectPath: string, type: 'soul', content: string) => Promise<void>
      startSetupAgent: (id: string, projectPath: string, type: 'init', userContext?: string) => Promise<string>
      listSoulTemplates: () => Promise<Array<{ id: string; name: string; description: string; content: string }>>
      applySoulTemplate: (projectPath: string, templateId: string) => Promise<void>
      startSoulAgent: (id: string, projectPath: string, templateId: string) => Promise<string>

      // ── Agent ────────────────────────────────────────────────────────────
      readSessionEvents: (sessionId: string) => Promise<AgentEvent[]>
      stopAgent: (sessionId: string) => Promise<void>
      watchSession: (sessionId: string) => Promise<AgentEvent[]>
      unwatchSession: (sessionId: string) => Promise<void>
      onSessionEvent: (callback: (data: { sessionId: string; event: AgentEvent }) => void) => () => void

      // ── Backlog ───────────────────────────────────────────────────────────
      getBacklogItems: (projectId: string) => Promise<BacklogItem[]>
      addBacklogItem: (projectId: string, item: Omit<BacklogItem, 'id' | 'createdAt' | 'status'>) => Promise<BacklogItem>
      updateBacklogItem: (projectId: string, id: string, patch: Partial<BacklogItem>) => Promise<BacklogItem | null>
      deleteBacklogItem: (projectId: string, id: string) => Promise<void>

      // ── Milestones ───────────────────────────────────────────────────────
      getMilestones: (projectId: string) => Promise<Milestone[]>
      saveMilestone: (projectId: string, milestone: Milestone) => Promise<void>
      deleteMilestone: (projectId: string, id: string) => Promise<void>
      onMilestoneReviewDone: (callback: (milestoneId: string) => void) => () => void
      onMilestoneUpdated: (callback: (data: { projectId: string; milestone: Milestone }) => void) => () => void
      onMilestoneCompleted: (callback: (data: { projectId: string; milestoneId: string }) => void) => () => void

      // ── Project / Scheduler ──────────────────────────────────────────────
      wakeProject: (projectId: string) => Promise<void>
      updateWakeSchedule: (projectId: string, schedule: WakeSchedule) => Promise<void>
      updateAutoMerge: (projectId: string, autoMerge: boolean) => Promise<void>
      updateAutoApprove: (projectId: string, autoApprove: boolean) => Promise<void>
      transitionMilestone: (projectId: string, milestoneId: string, payload: TransitionPayload) => Promise<void>
      getMilestoneGitStatus: (projectId: string, milestoneId: string) => Promise<MilestoneGitInfo | null>
      getMilestoneComments: (milestoneId: string) => Promise<MilestoneComment[]>
      addMilestoneComment: (comment: MilestoneComment) => Promise<void>
      onMilestoneAwaitingReview: (callback: (data: { projectId: string; milestoneId: string }) => void) => () => void
      onProjectStatusChanged: (callback: (status: ProjectIterationStatus) => void) => () => void
      onProjectAgentEvent: (callback: (data: ProjectAgentEvent) => void) => () => void
      onIterationPaused: (callback: (data: { projectId: string; milestoneId: string; reason: string }) => void) => () => void
      onRateLimited: (callback: (data: { projectId: string; resetAt: string }) => void) => () => void

      // ── Agents ────────────────────────────────────────────────────────────
      getAgents: () => Promise<Array<{ id: string; name: string; description: string }>>

      // ── MCP Servers ─────────────────────────────────────────────────────
      getMcpServers: () => Promise<Record<string, McpServerEntry>>
      addMcpServer: (name: string, entry: McpServerEntry) => Promise<void>
      updateMcpServer: (name: string, entry: McpServerEntry) => Promise<void>
      removeMcpServer: (name: string) => Promise<void>

      // ── Actions ────────────────────────────────────────────────────────────
      getActionsByMilestone: (milestoneId: string) => Promise<Action[]>
      getActionsByProject: (projectId: string, limit: number) => Promise<Action[]>
      getRecentActions: (limit: number) => Promise<Action[]>

      // ── Auto Updater ──────────────────────────────────────────────────────
      checkForUpdates: () => Promise<string | null>
      downloadUpdate: () => Promise<void>
      installUpdate: () => void
      onUpdaterStatus: (callback: (data: UpdaterStatus) => void) => () => void
    }
  }
}
