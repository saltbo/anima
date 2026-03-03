import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'
import { nowISO } from '../lib/time'
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
  total_tokens: number  // computed via subquery
  total_cost: number    // computed via subquery
  rate_limit_reset_at: string | null
}

const PROJECT_SELECT = `
  SELECT p.id, p.path, p.name, p.added_at, p.status, p.current_iteration,
    p.next_wake_time, p.wake_schedule, p.rate_limit_reset_at,
    COALESCE((SELECT SUM(i.total_tokens) FROM iterations i JOIN milestones m ON i.milestone_id = m.id WHERE m.project_id = p.id), 0) as total_tokens,
    COALESCE((SELECT SUM(i.total_cost) FROM iterations i JOIN milestones m ON i.milestone_id = m.id WHERE m.project_id = p.id), 0) as total_cost
  FROM projects p`

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
    const rows = this.db.prepare(`${PROJECT_SELECT} ORDER BY p.added_at`).all() as ProjectRow[]
    return rows.map(rowToProject)
  }

  getById(id: string): Project | null {
    const row = this.db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id) as ProjectRow | undefined
    return row ? rowToProject(row) : null
  }

  getByPath(projectPath: string): Project | null {
    const row = this.db.prepare(`${PROJECT_SELECT} WHERE p.path = ?`).get(projectPath) as ProjectRow | undefined
    return row ? rowToProject(row) : null
  }

  add(projectPath: string): Project {
    const id = randomUUID()
    const name = path.basename(projectPath)
    const addedAt = nowISO()
    const defaultSchedule = JSON.stringify({ mode: 'manual', intervalMinutes: null, times: [] })

    this.db.prepare(
      'INSERT INTO projects (id, path, name, added_at, wake_schedule) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectPath, name, addedAt, defaultSchedule)

    const project = this.getById(id)
    if (!project) throw new Error(`Failed to retrieve newly inserted project: ${id}`)
    return project
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  /** Update specific fields on a project (state or metadata). */
  patch(projectId: string, patch: Partial<Omit<Project, 'id' | 'path' | 'name' | 'addedAt' | 'totalTokens' | 'totalCost'>>): Project {
    const current = this.getById(projectId)
    if (!current) throw new Error(`Project not found: ${projectId}`)

    const merged = { ...current, ...patch }
    this.db.prepare(
      `UPDATE projects SET
        status = ?,
        current_iteration = ?,
        next_wake_time = ?,
        wake_schedule = ?,
        rate_limit_reset_at = ?
      WHERE id = ?`
    ).run(
      merged.status,
      merged.currentIteration ? JSON.stringify(merged.currentIteration) : null,
      merged.nextWakeTime,
      JSON.stringify(merged.wakeSchedule),
      merged.rateLimitResetAt,
      projectId
    )

    return this.getById(projectId)!
  }
}
