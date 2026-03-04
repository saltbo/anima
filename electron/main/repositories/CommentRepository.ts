import type Database from 'better-sqlite3'
import type { MilestoneComment } from '../../../src/types/index'

interface CommentRow {
  id: string
  milestone_id: string
  body: string
  author: string
  path: string | null
  line: number | null
  start_line: number | null
  commit_id: string | null
  in_reply_to_id: string | null
  created_at: string
  updated_at: string
}

function rowToComment(row: CommentRow): MilestoneComment {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    body: row.body,
    author: row.author,
    path: row.path ?? undefined,
    line: row.line ?? undefined,
    startLine: row.start_line ?? undefined,
    commitId: row.commit_id ?? undefined,
    inReplyToId: row.in_reply_to_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class CommentRepository {
  constructor(private db: Database.Database) {}

  getByMilestoneId(milestoneId: string): MilestoneComment[] {
    const rows = this.db.prepare(
      'SELECT * FROM milestone_comments WHERE milestone_id = ? ORDER BY created_at ASC'
    ).all(milestoneId) as CommentRow[]
    return rows.map(rowToComment)
  }

  add(comment: MilestoneComment): void {
    this.db.prepare(
      `INSERT INTO milestone_comments (id, milestone_id, body, author, path, line, start_line, commit_id, in_reply_to_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      comment.id,
      comment.milestoneId,
      comment.body,
      comment.author,
      comment.path ?? null,
      comment.line ?? null,
      comment.startLine ?? null,
      comment.commitId ?? null,
      comment.inReplyToId ?? null,
      comment.createdAt,
      comment.updatedAt,
    )
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM milestone_comments WHERE id = ?').run(id)
  }
}
