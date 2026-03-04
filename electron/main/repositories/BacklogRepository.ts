import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { nowISO } from '../lib/time'
import type { BacklogItem, BacklogItemPriority, BacklogItemStatus, BacklogItemType } from '../../../src/types/index'

interface BacklogRow {
  id: string
  project_id: string
  type: string
  title: string
  description: string | null
  priority: string
  status: string
  milestone_id: string | null
  created_at: string
}

function rowToItem(row: BacklogRow): BacklogItem {
  return {
    id: row.id,
    type: row.type as BacklogItemType,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as BacklogItemPriority,
    status: row.status as BacklogItemStatus,
    milestoneId: row.milestone_id ?? undefined,
    createdAt: row.created_at,
  }
}

export class BacklogRepository {
  constructor(private db: Database.Database) {}

  getByProjectId(projectId: string): BacklogItem[] {
    const rows = this.db
      .prepare('SELECT * FROM backlog_items WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as BacklogRow[]
    return rows.map(rowToItem)
  }

  getById(id: string): BacklogItem | null {
    const row = this.db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id) as BacklogRow | undefined
    return row ? rowToItem(row) : null
  }

  getByMilestoneId(milestoneId: string): BacklogItem[] {
    const rows = this.db
      .prepare('SELECT * FROM backlog_items WHERE milestone_id = ?')
      .all(milestoneId) as BacklogRow[]
    return rows.map(rowToItem)
  }

  add(projectId: string, item: Omit<BacklogItem, 'id' | 'createdAt' | 'status'>): BacklogItem {
    const newItem: BacklogItem = {
      ...item,
      id: randomUUID(),
      status: 'todo',
      createdAt: nowISO(),
    }
    this.db
      .prepare(
        `INSERT INTO backlog_items (id, project_id, type, title, description, priority, status, milestone_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newItem.id,
        projectId,
        newItem.type,
        newItem.title,
        newItem.description ?? null,
        newItem.priority,
        newItem.status,
        newItem.milestoneId ?? null,
        newItem.createdAt
      )
    return newItem
  }

  update(id: string, patch: Partial<BacklogItem>): BacklogItem | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updated = { ...existing, ...patch }
    this.db
      .prepare(
        `UPDATE backlog_items SET
           type = ?, title = ?, description = ?, priority = ?, status = ?, milestone_id = ?
         WHERE id = ?`
      )
      .run(
        updated.type,
        updated.title,
        updated.description ?? null,
        updated.priority,
        updated.status,
        updated.milestoneId ?? null,
        id
      )
    return updated
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM backlog_items WHERE id = ?').run(id)
  }
}
