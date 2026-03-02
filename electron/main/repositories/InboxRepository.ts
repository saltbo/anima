import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { InboxItem, InboxItemPriority, InboxItemStatus, InboxItemType } from '../../../src/types/index'

interface InboxRow {
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

function rowToItem(row: InboxRow): InboxItem {
  return {
    id: row.id,
    type: row.type as InboxItemType,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as InboxItemPriority,
    status: row.status as InboxItemStatus,
    milestoneId: row.milestone_id ?? undefined,
    createdAt: row.created_at,
  }
}

export class InboxRepository {
  constructor(private db: Database.Database) {}

  getByProjectId(projectId: string): InboxItem[] {
    const rows = this.db
      .prepare('SELECT * FROM inbox_items WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as InboxRow[]
    return rows.map(rowToItem)
  }

  getById(id: string): InboxItem | null {
    const row = this.db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id) as InboxRow | undefined
    return row ? rowToItem(row) : null
  }

  add(projectId: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>): InboxItem {
    const newItem: InboxItem = {
      ...item,
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    this.db
      .prepare(
        `INSERT INTO inbox_items (id, project_id, type, title, description, priority, status, milestone_id, created_at)
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

  update(id: string, patch: Partial<InboxItem>): InboxItem | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updated = { ...existing, ...patch }
    this.db
      .prepare(
        `UPDATE inbox_items SET
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
    this.db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id)
  }
}
