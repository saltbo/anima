import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Project } from '@/types'
import type { ProjectIterationStatus } from '@/types/electron.d'

interface ProjectsContextValue {
  projects: Project[]
  addProject: () => Promise<Project | null>
  removeProject: (id: string) => Promise<void>
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
  selectedProject: Project | null
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Fetch initial project list (now includes state)
  useEffect(() => {
    window.electronAPI.getProjects().then(setProjects)

    const cleanup = window.electronAPI.onProjectsUpdated((updatedProjects) => {
      setProjects(updatedProjects as Project[])
    })

    return cleanup
  }, [])

  // Listen for status changes from scheduler
  useEffect(() => {
    const cleanup = window.electronAPI.onProjectStatusChanged((update: ProjectIterationStatus) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === update.projectId
            ? {
                ...p,
                status: update.status,
                currentIteration: update.currentIteration,
                rateLimitResetAt: update.rateLimitResetAt,
              }
            : p
        )
      )
    })
    return cleanup
  }, [])

  const addProject = useCallback(async () => {
    const project = await window.electronAPI.addProject()
    return project
  }, [])

  const removeProject = useCallback(async (id: string) => {
    await window.electronAPI.removeProject(id)
    if (selectedProjectId === id) {
      setSelectedProjectId(null)
    }
  }, [selectedProjectId])

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null

  return (
    <ProjectsContext.Provider
      value={{ projects, addProject, removeProject, selectedProjectId, setSelectedProjectId, selectedProject }}
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
