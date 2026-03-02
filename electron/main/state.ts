import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '../../src/types/index'

const DEFAULT_STATE: ProjectState = {
  status: 'sleeping',
  currentIteration: null,
  nextWakeTime: null,
  wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
  totalTokens: 0,
  totalCost: 0,
  rateLimitResetAt: null,
}

function statePath(projectPath: string): string {
  return path.join(projectPath, '.anima', 'state.json')
}

export function getProjectState(projectPath: string): ProjectState {
  try {
    const p = statePath(projectPath)
    if (!fs.existsSync(p)) return { ...DEFAULT_STATE }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<ProjectState>
    return { ...DEFAULT_STATE, ...raw }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveProjectState(projectPath: string, state: ProjectState): void {
  const dir = path.join(projectPath, '.anima')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(statePath(projectPath), JSON.stringify(state, null, 2), 'utf8')
}

export function patchProjectState(projectPath: string, patch: Partial<ProjectState>): ProjectState {
  const state = { ...getProjectState(projectPath), ...patch }
  saveProjectState(projectPath, state)
  return state
}
