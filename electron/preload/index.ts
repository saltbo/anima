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
  writeSetupFile: (projectPath: string, type: 'soul', content: string) =>
    ipcRenderer.invoke('setup:writeFile', projectPath, type, content),
  startSetupAgent: (id: string, projectPath: string, type: 'init', userContext?: string) =>
    ipcRenderer.invoke('setup:startAgent', id, projectPath, type, userContext),
  listSoulTemplates: () =>
    ipcRenderer.invoke('setup:listTemplates'),
  applySoulTemplate: (projectPath: string, templateId: string) =>
    ipcRenderer.invoke('setup:applyTemplate', projectPath, templateId),
  startSoulAgent: (id: string, projectPath: string, templateId: string) =>
    ipcRenderer.invoke('setup:startSoulAgent', id, projectPath, templateId),

  // ── Agent ──────────────────────────────────────────────────────────────────
  readSessionEvents: (sessionId: string) => ipcRenderer.invoke('agent:readSessionEvents', sessionId),
  stopAgent: (sessionId: string) => ipcRenderer.invoke('agent:stop', sessionId),
  watchSession: (sessionId: string) => ipcRenderer.invoke('session:watch', sessionId),
  unwatchSession: (sessionId: string) => ipcRenderer.invoke('session:unwatch', sessionId),

  onSessionEvent: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('session:event', handler)
    return () => ipcRenderer.removeListener('session:event', handler)
  },

  // ── Backlog ─────────────────────────────────────────────────────────────────
  getBacklogItems: (projectId: string) => ipcRenderer.invoke('backlog:list', projectId),
  addBacklogItem: (projectId: string, item: unknown) => ipcRenderer.invoke('backlog:add', projectId, item),
  updateBacklogItem: (projectId: string, id: string, patch: unknown) => ipcRenderer.invoke('backlog:update', projectId, id, patch),
  deleteBacklogItem: (projectId: string, id: string) => ipcRenderer.invoke('backlog:delete', projectId, id),

  // ── Milestones ─────────────────────────────────────────────────────────────
  getMilestones: (projectId: string) => ipcRenderer.invoke('milestones:list', projectId),
  saveMilestone: (projectId: string, milestone: unknown) => ipcRenderer.invoke('milestones:save', projectId, milestone),
  deleteMilestone: (projectId: string, id: string) => ipcRenderer.invoke('milestones:delete', projectId, id),

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
  wakeProject: (projectId: string) => ipcRenderer.invoke('project:wake', projectId),
  updateWakeSchedule: (projectId: string, schedule: unknown) =>
    ipcRenderer.invoke('project:updateSchedule', projectId, schedule),
  updateAutoMerge: (projectId: string, autoMerge: boolean) =>
    ipcRenderer.invoke('project:updateAutoMerge', projectId, autoMerge),
  updateAutoApprove: (projectId: string, autoApprove: boolean) =>
    ipcRenderer.invoke('project:updateAutoApprove', projectId, autoApprove),
  transitionMilestone: (projectId: string, milestoneId: string, payload: { action: string; comment?: { id: string; body: string } }) =>
    ipcRenderer.invoke('milestones:transition', projectId, milestoneId, payload),
  getMilestoneGitStatus: (projectId: string, milestoneId: string) =>
    ipcRenderer.invoke('milestone:gitStatus', projectId, milestoneId),
  getMilestoneComments: (milestoneId: string) =>
    ipcRenderer.invoke('milestones:listComments', milestoneId),
  addMilestoneComment: (comment: unknown) =>
    ipcRenderer.invoke('milestones:addComment', comment),

  onMilestoneAwaitingReview: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('milestones:awaitingReview', handler)
    return () => ipcRenderer.removeListener('milestones:awaitingReview', handler)
  },

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

  // ── Agents ─────────────────────────────────────────────────────────────
  getAgents: () => ipcRenderer.invoke('agents:list'),

  // ── MCP Servers ───────────────────────────────────────────────────────────
  getMcpServers: () => ipcRenderer.invoke('mcp:list'),
  addMcpServer: (name: string, entry: unknown) => ipcRenderer.invoke('mcp:add', name, entry),
  updateMcpServer: (name: string, entry: unknown) => ipcRenderer.invoke('mcp:update', name, entry),
  removeMcpServer: (name: string) => ipcRenderer.invoke('mcp:remove', name),

  // ── Actions ──────────────────────────────────────────────────────────────
  getActionsByMilestone: (milestoneId: string) => ipcRenderer.invoke('actions:listByMilestone', milestoneId),
  getActionsByProject: (projectId: string, limit: number) => ipcRenderer.invoke('actions:listByProject', projectId, limit),
  getRecentActions: (limit: number) => ipcRenderer.invoke('actions:listRecent', limit),

  // ── Auto Updater ──────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },
})
