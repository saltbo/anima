export type ProjectStatus = 'sleeping' | 'checking' | 'awake' | 'paused' | 'rate_limited'

export interface Project {
  id: string
  path: string
  name: string
  status: ProjectStatus
  currentMilestone: string | null
  round: number
  nextWakeTime: string | null
  addedAt: string
}

export interface AppConfig {
  projects: Project[]
}
