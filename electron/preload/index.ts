import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),
  removeProject: (id: string) => ipcRenderer.invoke('remove-project', id),
  navigateTo: (path: string) => ipcRenderer.invoke('navigate-to', path),

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
})
