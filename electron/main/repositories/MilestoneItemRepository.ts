import type Database from 'better-sqlite3'
import { nowISO } from '../lib/time'

export class MilestoneItemRepository {
  constructor(private db: Database.Database) {}

  link(milestoneId: string, itemId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO milestone_items (milestone_id, item_id, created_at)
         VALUES (?, ?, ?)`
      )
      .run(milestoneId, itemId, nowISO())
  }

  unlink(milestoneId: string, itemId: string): void {
    this.db
      .prepare('DELETE FROM milestone_items WHERE milestone_id = ? AND item_id = ?')
      .run(milestoneId, itemId)
  }

  getItemIds(milestoneId: string): string[] {
    const rows = this.db
      .prepare('SELECT item_id FROM milestone_items WHERE milestone_id = ?')
      .all(milestoneId) as { item_id: string }[]
    return rows.map((r) => r.item_id)
  }

  getMilestoneIds(itemId: string): string[] {
    const rows = this.db
      .prepare('SELECT milestone_id FROM milestone_items WHERE item_id = ?')
      .all(itemId) as { milestone_id: string }[]
    return rows.map((r) => r.milestone_id)
  }
}
