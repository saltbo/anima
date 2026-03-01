import { contextBridge, ipcRenderer } from 'electron'
import log from 'electron-log/preload'

log.initialize({ spyRendererConsole: false })

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
  sendSetupMessage: (id: string, message: string) =>
    ipcRenderer.invoke('send-setup-message', id, message),
  stopSetupSession: (id: string) => ipcRenderer.invoke('stop-setup-session', id),
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
})
