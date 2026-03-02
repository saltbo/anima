import { contextBridge, ipcRenderer } from 'electron'
import 'electron-log/preload'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Projects ───────────────────────────────────────────────────────────────
  getProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: () => ipcRenderer.invoke('projects:add'),
  removeProject: (id: string) => ipcRenderer.invoke('projects:remove', id),

  onProjectsUpdated: (callback: (projects: unknown[]) => void) => {
    const handler = (_: unknown, projects: unknown[]) => callback(projects)
    ipcRenderer.on('projects:changed', handler)
    return () => ipcRenderer.removeListener('projects:changed', handler)
  },

  // ── Window ─────────────────────────────────────────────────────────────────
  navigateTo: (path: string) => ipcRenderer.invoke('window:navigate', path),

  onNavigate: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path)
    ipcRenderer.on('window:navigate', handler)
    return () => ipcRenderer.removeListener('window:navigate', handler)
  },

  onTriggerAddProject: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('window:addProject', handler)
    return () => ipcRenderer.removeListener('window:addProject', handler)
  },

  // ── Setup ──────────────────────────────────────────────────────────────────
  checkProjectSetup: (projectPath: string) =>
    ipcRenderer.invoke('setup:check', projectPath),
  readSetupFiles: (projectPath: string) =>
    ipcRenderer.invoke('setup:readFiles', projectPath),
  writeSetupFile: (projectPath: string, type: 'vision' | 'soul', content: string) =>
    ipcRenderer.invoke('setup:writeFile', projectPath, type, content),
  startSetupAgent: (id: string, projectPath: string, type: 'init', userContext?: string) =>
    ipcRenderer.invoke('setup:startAgent', id, projectPath, type, userContext),

  // ── Agent ──────────────────────────────────────────────────────────────────
  readAgentEvents: (agentKey: string) => ipcRenderer.invoke('agent:readEvents', agentKey),
  readSessionEvents: (sessionId: string) => ipcRenderer.invoke('agent:readSessionEvents', sessionId),
  sendAgentMessage: (id: string, message: string) =>
    ipcRenderer.invoke('agent:sendMessage', id, message),
  stopAgent: (id: string) => ipcRenderer.invoke('agent:stop', id),

  onAgentEvents: (callback: (agentKey: string, events: unknown[]) => void) => {
    const handler = (_: unknown, agentKey: string, events: unknown[]) => callback(agentKey, events)
    ipcRenderer.on('agent:events', handler)
    return () => ipcRenderer.removeListener('agent:events', handler)
  },

  // ── Inbox ──────────────────────────────────────────────────────────────────
  getInboxItems: (projectPath: string) => ipcRenderer.invoke('inbox:list', projectPath),
  addInboxItem: (projectPath: string, item: unknown) => ipcRenderer.invoke('inbox:add', projectPath, item),
  updateInboxItem: (projectPath: string, id: string, patch: unknown) => ipcRenderer.invoke('inbox:update', projectPath, id, patch),
  deleteInboxItem: (projectPath: string, id: string) => ipcRenderer.invoke('inbox:delete', projectPath, id),

  // ── Milestones ─────────────────────────────────────────────────────────────
  getMilestones: (projectPath: string) => ipcRenderer.invoke('milestones:list', projectPath),
  saveMilestone: (projectPath: string, milestone: unknown) => ipcRenderer.invoke('milestones:save', projectPath, milestone),
  deleteMilestone: (projectPath: string, id: string) => ipcRenderer.invoke('milestones:delete', projectPath, id),
  updateMilestoneTask: (projectPath: string, milestoneId: string, taskId: string, patch: unknown) =>
    ipcRenderer.invoke('milestones:updateTask', projectPath, milestoneId, taskId, patch),
  readMilestoneMarkdown: (projectPath: string, id: string) => ipcRenderer.invoke('milestones:readDoc', projectPath, id),
  writeMilestoneMarkdown: (projectPath: string, id: string, content: string) => ipcRenderer.invoke('milestones:writeDoc', projectPath, id, content),
  startMilestonePlanning: (id: string, projectPath: string, inboxItemIds: string[], title: string, description: string) =>
    ipcRenderer.invoke('milestones:startPlanning', id, projectPath, inboxItemIds, title, description),

  onMilestonePlanningDone: (callback: (planningId: string, milestoneId: string) => void) => {
    const handler = (_: unknown, planningId: string, milestoneId: string) => callback(planningId, milestoneId)
    ipcRenderer.on('milestones:planningDone', handler)
    return () => ipcRenderer.removeListener('milestones:planningDone', handler)
  },

  onMilestoneReviewDone: (callback: (milestoneId: string) => void) => {
    const handler = (_: unknown, milestoneId: string) => callback(milestoneId)
    ipcRenderer.on('milestones:reviewDone', handler)
    return () => ipcRenderer.removeListener('milestones:reviewDone', handler)
  },

  onMilestoneUpdated: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('milestones:updated', handler)
    return () => ipcRenderer.removeListener('milestones:updated', handler)
  },

  onMilestoneCompleted: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('milestones:completed', handler)
    return () => ipcRenderer.removeListener('milestones:completed', handler)
  },

  // ── Project / Scheduler ────────────────────────────────────────────────────
  getProjectState: (projectPath: string) => ipcRenderer.invoke('project:getState', projectPath),
  wakeProject: (projectId: string) => ipcRenderer.invoke('project:wake', projectId),
  updateWakeSchedule: (projectId: string, projectPath: string, schedule: unknown) =>
    ipcRenderer.invoke('project:updateSchedule', projectId, projectPath, schedule),
  cancelMilestone: (projectId: string, projectPath: string, milestoneId: string) =>
    ipcRenderer.invoke('milestone:cancel', projectId, projectPath, milestoneId),

  onProjectStatusChanged: (callback: (status: unknown) => void) => {
    const handler = (_: unknown, status: unknown) => callback(status)
    ipcRenderer.on('project:statusChanged', handler)
    return () => ipcRenderer.removeListener('project:statusChanged', handler)
  },

  onProjectAgentEvent: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('project:agentEvent', handler)
    return () => ipcRenderer.removeListener('project:agentEvent', handler)
  },

  onIterationPaused: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('project:iterationPaused', handler)
    return () => ipcRenderer.removeListener('project:iterationPaused', handler)
  },

  onRateLimited: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('agent:rateLimited', handler)
    return () => ipcRenderer.removeListener('agent:rateLimited', handler)
  },
})
