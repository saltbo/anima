import type { Project } from './index'

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<Project[]>
      addProject: () => Promise<Project | null>
      removeProject: (id: string) => Promise<boolean>
      navigateTo: (path: string) => Promise<void>
      onProjectsUpdated: (callback: (projects: Project[]) => void) => () => void
      onNavigate: (callback: (path: string) => void) => () => void
      onTriggerAddProject: (callback: () => void) => () => void
    }
  }
}
