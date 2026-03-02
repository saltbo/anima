import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'
import type { Project, ProjectStatus, Iteration, WakeSchedule } from '../../../src/types/index'

interface ProjectRow {
  id: string
  path: string
  name: string
  added_at: string
  status: string
  current_iteration: string | null
  next_wake_time: string | null
  wake_schedule: string
  total_tokens: number
  total_cost: number
  rate_limit_reset_at: string | null
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    addedAt: row.added_at,
    status: row.status as ProjectStatus,
    currentIteration: row.current_iteration ? (JSON.parse(row.current_iteration) as Iteration) : null,
    nextWakeTime: row.next_wake_time,
    wakeSchedule: JSON.parse(row.wake_schedule) as WakeSchedule,
    totalTokens: row.total_tokens,
    totalCost: row.total_cost,
    rateLimitResetAt: row.rate_limit_reset_at,
  }
}

export class ProjectRepository {
  constructor(private db: Database.Database) {}

  getAll(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY added_at').all() as ProjectRow[]
    return rows.map(rowToProject)
  }

  getById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    return row ? rowToProject(row) : null
  }

  getByPath(projectPath: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath) as ProjectRow | undefined
    return row ? rowToProject(row) : null
  }

  add(projectPath: string): Project {
    const id = randomUUID()
    const name = path.basename(projectPath)
    const addedAt = new Date().toISOString()
    const defaultSchedule = JSON.stringify({ mode: 'manual', intervalMinutes: null, times: [] })

    this.db.prepare(
      'INSERT INTO projects (id, path, name, added_at, wake_schedule) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectPath, name, addedAt, defaultSchedule)

    return this.getById(id)!
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  resolveProjectId(projectPath: string): string | null {
    const row = this.db.prepare('SELECT id FROM projects WHERE path = ?').get(projectPath) as
      | { id: string }
      | undefined
    return row?.id ?? null
  }

  /** Update specific fields on a project (state or metadata). */
  patch(projectId: string, patch: Partial<Omit<Project, 'id' | 'path' | 'name' | 'addedAt'>>): Project {
    const current = this.getById(projectId)
    if (!current) throw new Error(`Project not found: ${projectId}`)

    const merged = { ...current, ...patch }
    this.db.prepare(
      `UPDATE projects SET
        status = ?,
        current_iteration = ?,
        next_wake_time = ?,
        wake_schedule = ?,
        total_tokens = ?,
        total_cost = ?,
        rate_limit_reset_at = ?
      WHERE id = ?`
    ).run(
      merged.status,
      merged.currentIteration ? JSON.stringify(merged.currentIteration) : null,
      merged.nextWakeTime,
      JSON.stringify(merged.wakeSchedule),
      merged.totalTokens,
      merged.totalCost,
      merged.rateLimitResetAt,
      projectId
    )

    return merged
  }
}
