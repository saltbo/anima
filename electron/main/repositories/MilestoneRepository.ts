import type Database from 'better-sqlite3'
import type {
  Milestone,
  Iteration,
  MilestoneStatus,
  BacklogItem,
  BacklogItemType,
  BacklogItemPriority,
  BacklogItemStatus,
  MilestoneCheck,
  MilestoneCheckStatus,
} from '../../../src/types/index'

interface MilestoneRow {
  id: string
  project_id: string
  title: string
  description: string
  status: string
  created_at: string
  completed_at: string | null
  iteration_count: number
  base_commit: string | null
  assignees: string
}

interface IterationRow {
  id: number
  milestone_id: string
  round: number
  developer_session_id: string | null
  acceptor_session_id: string | null
  outcome: string | null
  started_at: string | null
  completed_at: string | null
  total_tokens: number
  total_cost: number
  model: string | null
}

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

function rowToMilestone(
  row: MilestoneRow,
  iterations: Iteration[],
  items: BacklogItem[],
  checks: MilestoneCheck[]
): Milestone {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as MilestoneStatus,
    items,
    checks,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    iterationCount: row.iteration_count,
    iterations,
    totalTokens: iterations.reduce((sum, i) => sum + (i.totalTokens ?? 0), 0),
    totalCost: iterations.reduce((sum, i) => sum + (i.totalCost ?? 0), 0),
    baseCommit: row.base_commit ?? undefined,
    assignees: JSON.parse(row.assignees || '[]'),
  }
}

function iterRowToIteration(row: IterationRow): Iteration {
  return {
    milestoneId: row.milestone_id,
    round: row.round,
    developerSessionId: row.developer_session_id ?? undefined,
    acceptorSessionId: row.acceptor_session_id ?? undefined,
    outcome: (row.outcome as Iteration['outcome']) ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    totalTokens: row.total_tokens || undefined,
    totalCost: row.total_cost || undefined,
    model: row.model ?? undefined,
  }
}

function backlogRowToItem(row: BacklogRow): BacklogItem {
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

function checkRowToCheck(row: CheckRow): MilestoneCheck {
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

export class MilestoneRepository {
  constructor(private db: Database.Database) {}

  private getIterations(milestoneId: string): Iteration[] {
    const rows = this.db
      .prepare('SELECT * FROM iterations WHERE milestone_id = ? ORDER BY round')
      .all(milestoneId) as IterationRow[]
    return rows.map(iterRowToIteration)
  }

  private getItems(milestoneId: string): BacklogItem[] {
    const rows = this.db
      .prepare('SELECT * FROM backlog_items WHERE milestone_id = ? ORDER BY created_at')
      .all(milestoneId) as BacklogRow[]
    return rows.map(backlogRowToItem)
  }

  private getChecks(milestoneId: string): MilestoneCheck[] {
    const rows = this.db
      .prepare(
        `SELECT mc.* FROM milestone_checks mc
         JOIN backlog_items bi ON mc.item_id = bi.id
         WHERE bi.milestone_id = ?
         ORDER BY mc.created_at`
      )
      .all(milestoneId) as CheckRow[]
    return rows.map(checkRowToCheck)
  }

  getByProjectId(projectId: string): Milestone[] {
    const rows = this.db
      .prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as MilestoneRow[]
    return rows.map((row) =>
      rowToMilestone(
        row,
        this.getIterations(row.id),
        this.getItems(row.id),
        this.getChecks(row.id)
      )
    )
  }

  getById(id: string): Milestone | null {
    const row = this.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow | undefined
    if (!row) return null
    return rowToMilestone(
      row,
      this.getIterations(id),
      this.getItems(id),
      this.getChecks(id)
    )
  }

  save(projectId: string, milestone: Milestone): void {
    this.db
      .prepare(
        `INSERT INTO milestones
         (id, project_id, title, description, status, created_at, completed_at, iteration_count, base_commit, assignees)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           completed_at = excluded.completed_at,
           iteration_count = excluded.iteration_count,
           base_commit = excluded.base_commit,
           assignees = excluded.assignees`
      )
      .run(
        milestone.id,
        projectId,
        milestone.title,
        milestone.description,
        milestone.status,
        milestone.createdAt,
        milestone.completedAt ?? null,
        milestone.iterationCount,
        milestone.baseCommit ?? null,
        JSON.stringify(milestone.assignees ?? [])
      )
  }

  delete(id: string): void {
    // iterations cascade-deleted via FK
    this.db.prepare('DELETE FROM milestones WHERE id = ?').run(id)
  }

  addIteration(iteration: Iteration): void {
    this.db
      .prepare(
        `INSERT INTO iterations
         (milestone_id, round, developer_session_id, acceptor_session_id, outcome, started_at, completed_at, total_tokens, total_cost, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        iteration.milestoneId,
        iteration.round,
        iteration.developerSessionId ?? null,
        iteration.acceptorSessionId ?? null,
        iteration.outcome ?? null,
        iteration.startedAt ?? null,
        iteration.completedAt ?? null,
        iteration.totalTokens ?? 0,
        iteration.totalCost ?? 0,
        iteration.model ?? null
      )
  }

  getProjectIdForMilestone(milestoneId: string): string | null {
    const row = this.db.prepare('SELECT project_id FROM milestones WHERE id = ?').get(milestoneId) as
      | { project_id: string }
      | undefined
    return row?.project_id ?? null
  }
}
