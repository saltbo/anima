import type Database from 'better-sqlite3'
import type { Action } from '../../../src/types/index'

interface ActionRow {
  id: number
  project_id: string
  milestone_id: string | null
  type: string
  actor: string
  detail: string | null
  created_at: string
}

function rowToAction(row: ActionRow): Action {
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id ?? undefined,
    type: row.type as Action['type'],
    actor: row.actor,
    detail: row.detail ?? undefined,
    createdAt: row.created_at,
  }
}

export class ActionRepository {
  constructor(private db: Database.Database) {}

  add(action: Omit<Action, 'id'>): void {
    this.db.prepare(
      `INSERT INTO actions (project_id, milestone_id, type, actor, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      action.projectId,
      action.milestoneId ?? null,
      action.type,
      action.actor,
      action.detail ?? null,
      action.createdAt,
    )
  }

  getByMilestoneId(milestoneId: string): Action[] {
    const rows = this.db.prepare(
      'SELECT * FROM actions WHERE milestone_id = ? ORDER BY created_at ASC'
    ).all(milestoneId) as ActionRow[]
    return rows.map(rowToAction)
  }

  getRecent(limit: number): Action[] {
    const rows = this.db.prepare(
      'SELECT * FROM actions ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as ActionRow[]
    return rows.map(rowToAction)
  }

  getByProjectId(projectId: string, limit: number): Action[] {
    const rows = this.db.prepare(
      'SELECT * FROM actions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(projectId, limit) as ActionRow[]
    return rows.map(rowToAction)
  }
}
