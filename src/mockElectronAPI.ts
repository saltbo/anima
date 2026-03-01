import type { Project } from './types'

const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    path: '/Users/dev/project-alpha',
    name: 'Project Alpha',
    status: 'awake',
    currentMilestone: 'M2 Backend API',
    round: 3,
    nextWakeTime: null,
    addedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    totalTokens: 142800,
    totalCost: 1.83,
  },
  {
    id: '2',
    path: '/Users/dev/project-beta',
    name: 'Project Beta',
    status: 'sleeping',
    currentMilestone: null,
    round: 1,
    nextWakeTime: new Date(Date.now() + 3600000).toISOString(),
    addedAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    totalTokens: 23400,
    totalCost: 0.31,
  },
  {
    id: '3',
    path: '/Users/dev/landing-page',
    name: 'Landing Page',
    status: 'checking',
    currentMilestone: 'M1 Design',
    round: 0,
    nextWakeTime: null,
    addedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    totalTokens: 58900,
    totalCost: 0.74,
  },
]

let projects = [...MOCK_PROJECTS]
let projectListeners: ((projects: Project[]) => void)[] = []

function notify() {
  projectListeners.forEach((cb) => cb([...projects]))
}

export function installMockElectronAPI() {
  if (window.electronAPI) return

  window.electronAPI = {
    getProjects: async () => [...projects],

    addProject: async () => {
      const newProject: Project = {
        id: String(Date.now()),
        path: `/Users/dev/new-project-${projects.length + 1}`,
        name: `New Project ${projects.length + 1}`,
        status: 'sleeping',
        currentMilestone: null,
        round: 0,
        nextWakeTime: null,
        addedAt: new Date().toISOString(),
      }
      projects = [...projects, newProject]
      notify()
      return newProject
    },

    removeProject: async (id: string) => {
      projects = projects.filter((p) => p.id !== id)
      notify()
      return true
    },

    navigateTo: async () => {},

    onProjectsUpdated: (callback) => {
      projectListeners.push(callback)
      return () => {
        projectListeners = projectListeners.filter((cb) => cb !== callback)
      }
    },

    onNavigate: () => () => {},
    onTriggerAddProject: () => () => {},
  }
}
