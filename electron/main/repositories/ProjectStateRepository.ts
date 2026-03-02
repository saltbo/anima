import type Database from 'better-sqlite3'
import type { ProjectState, Iteration, WakeSchedule } from '../../../src/types/index'

interface StateRow {
  project_id: string
  status: string
  current_iteration: string | null
  next_wake_time: string | null
  wake_schedule: string
  total_tokens: number
  total_cost: number
  rate_limit_reset_at: string | null
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

function rowToState(row: StateRow): ProjectState {
  return {
    status: row.status as ProjectState['status'],
    currentIteration: row.current_iteration ? (JSON.parse(row.current_iteration) as Iteration) : null,
    nextWakeTime: row.next_wake_time,
    wakeSchedule: JSON.parse(row.wake_schedule) as WakeSchedule,
    totalTokens: row.total_tokens,
    totalCost: row.total_cost,
    rateLimitResetAt: row.rate_limit_reset_at,
  }
}

export class ProjectStateRepository {
  constructor(private db: Database.Database) {}

  get(projectId: string): ProjectState {
    const row = this.db.prepare('SELECT * FROM project_state WHERE project_id = ?').get(projectId) as
      | StateRow
      | undefined
    return row ? rowToState(row) : { ...DEFAULT_STATE }
  }

  getByPath(projectPath: string): ProjectState {
    const row = this.db
      .prepare(
        `SELECT ps.* FROM project_state ps
         JOIN projects p ON p.id = ps.project_id
         WHERE p.path = ?`
      )
      .get(projectPath) as StateRow | undefined
    return row ? rowToState(row) : { ...DEFAULT_STATE }
  }

  save(projectId: string, state: ProjectState): void {
    this.db
      .prepare(
        `INSERT INTO project_state
         (project_id, status, current_iteration, next_wake_time, wake_schedule, total_tokens, total_cost, rate_limit_reset_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           status = excluded.status,
           current_iteration = excluded.current_iteration,
           next_wake_time = excluded.next_wake_time,
           wake_schedule = excluded.wake_schedule,
           total_tokens = excluded.total_tokens,
           total_cost = excluded.total_cost,
           rate_limit_reset_at = excluded.rate_limit_reset_at`
      )
      .run(
        projectId,
        state.status,
        state.currentIteration ? JSON.stringify(state.currentIteration) : null,
        state.nextWakeTime,
        JSON.stringify(state.wakeSchedule),
        state.totalTokens,
        state.totalCost,
        state.rateLimitResetAt
      )
  }

  patch(projectId: string, patch: Partial<ProjectState>): ProjectState {
    const current = this.get(projectId)
    const updated = { ...current, ...patch }
    this.save(projectId, updated)
    return updated
  }
}
