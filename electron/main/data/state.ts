import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../logger'
import type { ProjectState } from '../../../src/types/index'

const log = createLogger('state')

const REQUIRED_KEYS: (keyof ProjectState)[] = [
  'status',
  'currentIteration',
  'nextWakeTime',
  'wakeSchedule',
  'totalTokens',
  'totalCost',
  'rateLimitResetAt',
]

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

function validateAndMigrate(raw: Record<string, unknown>, projectPath: string): ProjectState {
  const unknownKeys = Object.keys(raw).filter((k) => !REQUIRED_KEYS.includes(k as keyof ProjectState))
  if (unknownKeys.length > 0) {
    log.error('state.json has unknown keys — possible schema mismatch. Dropping unknown keys.', {
      project: projectPath,
      unknownKeys,
    })
  }

  const state: ProjectState = { ...DEFAULT_STATE }
  for (const key of REQUIRED_KEYS) {
    if (key in raw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(state as any)[key] = raw[key]
    } else {
      log.error(`state.json is missing required key "${key}" — using default value.`, {
        project: projectPath,
        default: DEFAULT_STATE[key],
      })
    }
  }

  // Consistency check: awake state must have a currentIteration
  if (state.status === 'awake' && state.currentIteration === null) {
    log.error('state.json is inconsistent: status is "awake" but currentIteration is null. Resetting to sleeping.', {
      project: projectPath,
    })
    state.status = 'sleeping'
  }

  return state
}

export function getProjectState(projectPath: string): ProjectState {
  try {
    const p = statePath(projectPath)
    if (!fs.existsSync(p)) return { ...DEFAULT_STATE }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>
    return validateAndMigrate(raw, projectPath)
  } catch (err) {
    log.error('failed to read state.json, using default state', { project: projectPath, error: String(err) })
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
