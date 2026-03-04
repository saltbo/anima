import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { nowISO } from '../lib/time'
import type { MilestoneCheck, MilestoneCheckStatus } from '../../../src/types/index'

interface CheckRow {
  id: string
  item_id: string
  title: string
  description: string | null
  status: string
  iteration: number
  created_at: string
  updated_at: string
}

function rowToCheck(row: CheckRow): MilestoneCheck {
  return {
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as MilestoneCheckStatus,
    iteration: row.iteration,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class CheckRepository {
  constructor(private db: Database.Database) {}

  getByItemId(itemId: string): MilestoneCheck[] {
    const rows = this.db
      .prepare('SELECT * FROM milestone_checks WHERE item_id = ? ORDER BY created_at')
      .all(itemId) as CheckRow[]
    return rows.map(rowToCheck)
  }

  getByMilestoneId(milestoneId: string): MilestoneCheck[] {
    const rows = this.db
      .prepare(
        `SELECT mc.* FROM milestone_checks mc
         JOIN backlog_items bi ON mc.item_id = bi.id
         WHERE bi.milestone_id = ?
         ORDER BY mc.created_at`
      )
      .all(milestoneId) as CheckRow[]
    return rows.map(rowToCheck)
  }

  add(check: Omit<MilestoneCheck, 'id' | 'createdAt' | 'updatedAt'>): MilestoneCheck {
    const now = nowISO()
    const newCheck: MilestoneCheck = {
      ...check,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO milestone_checks (id, item_id, title, description, status, iteration, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newCheck.id,
        newCheck.itemId,
        newCheck.title,
        newCheck.description ?? null,
        newCheck.status,
        newCheck.iteration,
        newCheck.createdAt,
        newCheck.updatedAt
      )
    return newCheck
  }

  update(id: string, patch: Partial<Pick<MilestoneCheck, 'status' | 'title' | 'description' | 'iteration'>>): MilestoneCheck | null {
    const row = this.db.prepare('SELECT * FROM milestone_checks WHERE id = ?').get(id) as CheckRow | undefined
    if (!row) return null

    const existing = rowToCheck(row)
    const updated = { ...existing, ...patch, updatedAt: nowISO() }
    this.db
      .prepare(
        `UPDATE milestone_checks SET title = ?, description = ?, status = ?, iteration = ?, updated_at = ? WHERE id = ?`
      )
      .run(updated.title, updated.description ?? null, updated.status, updated.iteration, updated.updatedAt, id)
    return updated
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM milestone_checks WHERE id = ?').run(id)
  }

  bulkAdd(checks: Array<Omit<MilestoneCheck, 'id' | 'createdAt' | 'updatedAt'>>): MilestoneCheck[] {
    return checks.map((c) => this.add(c))
  }
}
