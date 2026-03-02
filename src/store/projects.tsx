import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Project, ProjectView, ProjectState } from '@/types'
import type { ProjectIterationStatus } from '@/types/electron.d'

interface ProjectsContextValue {
  projects: ProjectView[]
  addProject: () => Promise<Project | null>
  removeProject: (id: string) => Promise<void>
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
  selectedProject: ProjectView | null
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null)

function stateToView(project: Project, state: ProjectState): ProjectView {
  return {
    ...project,
    status: state.status,
    currentIteration: state.currentIteration,
    nextWakeTime: state.nextWakeTime,
    totalTokens: state.totalTokens,
    totalCost: state.totalCost,
    rateLimitResetAt: state.rateLimitResetAt,
  }
}

const DEFAULT_STATE: ProjectState = {
  status: 'sleeping',
  currentIteration: null,
  nextWakeTime: null,
  wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
  totalTokens: 0,
  totalCost: 0,
  rateLimitResetAt: null,
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [states, setStates] = useState<Map<string, ProjectState>>(new Map())
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Fetch initial project list + states
  useEffect(() => {
    window.electronAPI.getProjects().then(async (rawProjects) => {
      setProjects(rawProjects)
      const stateEntries = await Promise.all(
        rawProjects.map(async (p) => {
          const state = await window.electronAPI.getProjectState(p.path)
          return [p.id, state] as [string, ProjectState]
        })
      )
      setStates(new Map(stateEntries))
    })

    const cleanup = window.electronAPI.onProjectsUpdated((updatedProjects) => {
      setProjects(updatedProjects as Project[])
    })

    return cleanup
  }, [])

  // Listen for status changes from scheduler
  useEffect(() => {
    const cleanup = window.electronAPI.onProjectStatusChanged((update: ProjectIterationStatus) => {
      setStates((prev) => {
        const existing = prev.get(update.projectId) ?? DEFAULT_STATE
        const next = new Map(prev)
        next.set(update.projectId, {
          ...existing,
          status: update.status,
          currentIteration: update.currentIteration,
          rateLimitResetAt: update.rateLimitResetAt,
        })
        return next
      })
    })
    return cleanup
  }, [])

  const addProject = useCallback(async () => {
    const project = await window.electronAPI.addProject()
    if (project) {
      const state = await window.electronAPI.getProjectState(project.path)
      setStates((prev) => new Map(prev).set(project.id, state))
    }
    return project
  }, [])

  const removeProject = useCallback(async (id: string) => {
    await window.electronAPI.removeProject(id)
    setStates((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    if (selectedProjectId === id) {
      setSelectedProjectId(null)
    }
  }, [selectedProjectId])

  // Merge project + state into views
  const projectViews: ProjectView[] = projects.map((p) =>
    stateToView(p, states.get(p.id) ?? DEFAULT_STATE)
  )

  const selectedProject = projectViews.find((p) => p.id === selectedProjectId) ?? null

  return (
    <ProjectsContext.Provider
      value={{ projects: projectViews, addProject, removeProject, selectedProjectId, setSelectedProjectId, selectedProject }}
    >
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider')
  return ctx
}
