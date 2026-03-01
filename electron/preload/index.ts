import { contextBridge, ipcRenderer } from 'electron'
import 'electron-log/preload'

contextBridge.exposeInMainWorld('electronAPI', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),
  removeProject: (id: string) => ipcRenderer.invoke('remove-project', id),
  navigateTo: (path: string) => ipcRenderer.invoke('navigate-to', path),

  checkProjectSetup: (projectPath: string) =>
    ipcRenderer.invoke('check-project-setup', projectPath),
  readSetupFiles: (projectPath: string) =>
    ipcRenderer.invoke('read-setup-files', projectPath),
  startSetupSession: (id: string, projectPath: string, type: 'vision' | 'soul' | 'init') =>
    ipcRenderer.invoke('start-setup-session', id, projectPath, type),
  sendAgentMessage: (id: string, message: string) =>
    ipcRenderer.invoke('send-agent-message', id, message),
  stopAgentSession: (id: string) => ipcRenderer.invoke('stop-agent-session', id),
  writeSetupFile: (projectPath: string, type: 'vision' | 'soul', content: string) =>
    ipcRenderer.invoke('write-setup-file', projectPath, type, content),

  onProjectsUpdated: (callback: (projects: unknown[]) => void) => {
    const handler = (_: unknown, projects: unknown[]) => callback(projects)
    ipcRenderer.on('projects-updated', handler)
    return () => ipcRenderer.removeListener('projects-updated', handler)
  },

  onNavigate: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path)
    ipcRenderer.on('navigate', handler)
    return () => ipcRenderer.removeListener('navigate', handler)
  },

  onTriggerAddProject: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-add-project', handler)
    return () => ipcRenderer.removeListener('trigger-add-project', handler)
  },

  onSetupChatData: (callback: (id: string, data: { event: string; text?: string; message?: string }) => void) => {
    const handler = (_: unknown, id: string, data: { event: string; text?: string; message?: string }) =>
      callback(id, data)
    ipcRenderer.on('setup-chat-data', handler)
    return () => ipcRenderer.removeListener('setup-chat-data', handler)
  },

  getInboxItems: (projectPath: string) => ipcRenderer.invoke('get-inbox-items', projectPath),
  addInboxItem: (projectPath: string, item: unknown) => ipcRenderer.invoke('add-inbox-item', projectPath, item),
  updateInboxItem: (projectPath: string, id: string, patch: unknown) => ipcRenderer.invoke('update-inbox-item', projectPath, id, patch),
  deleteInboxItem: (projectPath: string, id: string) => ipcRenderer.invoke('delete-inbox-item', projectPath, id),
  getMilestones: (projectPath: string) => ipcRenderer.invoke('get-milestones', projectPath),
  saveMilestone: (projectPath: string, milestone: unknown) => ipcRenderer.invoke('save-milestone', projectPath, milestone),
  deleteMilestone: (projectPath: string, id: string) => ipcRenderer.invoke('delete-milestone', projectPath, id),
  updateMilestoneTask: (projectPath: string, milestoneId: string, taskId: string, patch: unknown) => ipcRenderer.invoke('update-milestone-task', projectPath, milestoneId, taskId, patch),
  writeMilestoneMarkdown: (projectPath: string, id: string, content: string) => ipcRenderer.invoke('write-milestone-markdown', projectPath, id, content),
  readMilestoneMarkdown: (projectPath: string, id: string) => ipcRenderer.invoke('read-milestone-markdown', projectPath, id),
  startMilestonePlanningSession: (id: string, projectPath: string, inboxItemIds: string[], title: string, description: string) => ipcRenderer.invoke('start-milestone-planning-session', id, projectPath, inboxItemIds, title, description),

  onMilestonePlanningDone: (callback: (sessionId: string, milestoneId: string) => void) => {
    const handler = (_: unknown, sessionId: string, milestoneId: string) => callback(sessionId, milestoneId)
    ipcRenderer.on('milestone-planning-done', handler)
    return () => ipcRenderer.removeListener('milestone-planning-done', handler)
  },

  onMilestoneReviewDone: (callback: (milestoneId: string) => void) => {
    const handler = (_: unknown, milestoneId: string) => callback(milestoneId)
    ipcRenderer.on('milestone-review-done', handler)
    return () => ipcRenderer.removeListener('milestone-review-done', handler)
  },

  // ── M4: Iteration / Scheduler ──────────────────────────────────────────────

  getProjectState: (projectPath: string) => ipcRenderer.invoke('get-project-state', projectPath),
  wakeProject: (projectId: string) => ipcRenderer.invoke('wake-project', projectId),
  updateWakeSchedule: (projectId: string, projectPath: string, schedule: unknown) =>
    ipcRenderer.invoke('update-wake-schedule', projectId, projectPath, schedule),

  onProjectStatusChanged: (callback: (status: unknown) => void) => {
    const handler = (_: unknown, status: unknown) => callback(status)
    ipcRenderer.on('project-status-changed', handler)
    return () => ipcRenderer.removeListener('project-status-changed', handler)
  },

  onIterationAgentEvent: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('iteration-agent-event', handler)
    return () => ipcRenderer.removeListener('iteration-agent-event', handler)
  },

  onMilestoneUpdated: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('milestone-updated', handler)
    return () => ipcRenderer.removeListener('milestone-updated', handler)
  },

  onMilestoneCompleted: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('milestone-completed', handler)
    return () => ipcRenderer.removeListener('milestone-completed', handler)
  },

  onIterationPaused: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('iteration-paused', handler)
    return () => ipcRenderer.removeListener('iteration-paused', handler)
  },

  onRateLimited: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('rate-limited', handler)
    return () => ipcRenderer.removeListener('rate-limited', handler)
  },
})
