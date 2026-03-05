import type Database from 'better-sqlite3'
import type {
  Milestone,
  Iteration,
  AgentSession,
  AgentSessionStatus,
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
  outcome: string | null
  started_at: string | null
  completed_at: string | null
  status: string
  dispatch_count: number
}

interface SessionRow {
  id: string
  project_id: string
  milestone_id: string | null
  iteration_id: number | null
  agent_id: string
  started_at: string
  completed_at: string | null
  total_tokens: number
  total_cost: number
  model: string | null
  status: string
}

interface BacklogRow {
  id: string
  project_id: string
  type: string
  title: string
  description: string | null
  priority: string
  status: string
  created_at: string
}

interface CheckRow {
  id: string
  milestone_id: string
  item_id: string
  title: string
  description: string | null
  status: string
  iteration: number
  created_at: string
  updated_at: string
}

function sessionRowToSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id ?? undefined,
    iterationId: row.iteration_id ?? undefined,
    agentId: row.agent_id,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    totalTokens: row.total_tokens,
    totalCost: row.total_cost,
    model: row.model ?? undefined,
    status: row.status as AgentSessionStatus,
  }
}

function rowToMilestone(
  row: MilestoneRow,
  iterations: Iteration[],
  items: BacklogItem[],
  checks: MilestoneCheck[],
  totalTokens: number,
  totalCost: number,
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
    totalTokens,
    totalCost,
    baseCommit: row.base_commit ?? undefined,
    assignees: JSON.parse(row.assignees || '[]'),
  }
}

function iterRowToIteration(row: IterationRow, sessions: AgentSession[]): Iteration {
  return {
    milestoneId: row.milestone_id,
    round: row.round,
    sessions,
    outcome: (row.outcome as Iteration['outcome']) ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    totalTokens: sessions.reduce((sum, s) => sum + s.totalTokens, 0) || undefined,
    totalCost: sessions.reduce((sum, s) => sum + s.totalCost, 0) || undefined,
    status: row.status || 'pending',
    dispatchCount: row.dispatch_count || 0,
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
    createdAt: row.created_at,
  }
}

function checkRowToCheck(row: CheckRow): MilestoneCheck {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
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

  private getSessionsForIteration(iterationId: number): AgentSession[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_sessions WHERE iteration_id = ? ORDER BY started_at')
      .all(iterationId) as SessionRow[]
    return rows.map(sessionRowToSession)
  }

  private getIterations(milestoneId: string): Iteration[] {
    const rows = this.db
      .prepare('SELECT * FROM iterations WHERE milestone_id = ? ORDER BY round')
      .all(milestoneId) as IterationRow[]
    return rows.map((row) => iterRowToIteration(row, this.getSessionsForIteration(row.id)))
  }

  private getItems(milestoneId: string): BacklogItem[] {
    const rows = this.db
      .prepare(
        `SELECT bi.* FROM backlog_items bi
         JOIN milestone_items mi ON mi.item_id = bi.id
         WHERE mi.milestone_id = ?
         ORDER BY bi.created_at`
      )
      .all(milestoneId) as BacklogRow[]
    return rows.map(backlogRowToItem)
  }

  private getChecks(milestoneId: string): MilestoneCheck[] {
    const rows = this.db
      .prepare('SELECT * FROM milestone_checks WHERE milestone_id = ? ORDER BY created_at')
      .all(milestoneId) as CheckRow[]
    return rows.map(checkRowToCheck)
  }

  private getMilestoneTotals(milestoneId: string): { totalTokens: number; totalCost: number } {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(total_cost), 0) as cost FROM agent_sessions WHERE milestone_id = ?')
      .get(milestoneId) as { tokens: number; cost: number }
    return { totalTokens: row.tokens, totalCost: row.cost }
  }

  getByProjectId(projectId: string): Milestone[] {
    const rows = this.db
      .prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as MilestoneRow[]
    return rows.map((row) => {
      const totals = this.getMilestoneTotals(row.id)
      return rowToMilestone(
        row,
        this.getIterations(row.id),
        this.getItems(row.id),
        this.getChecks(row.id),
        totals.totalTokens,
        totals.totalCost,
      )
    })
  }

  getById(id: string): Milestone | null {
    const row = this.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow | undefined
    if (!row) return null
    const totals = this.getMilestoneTotals(id)
    return rowToMilestone(
      row,
      this.getIterations(id),
      this.getItems(id),
      this.getChecks(id),
      totals.totalTokens,
      totals.totalCost,
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
         (milestone_id, round, outcome, started_at, completed_at, status, dispatch_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        iteration.milestoneId,
        iteration.round,
        iteration.outcome ?? null,
        iteration.startedAt ?? null,
        iteration.completedAt ?? null,
        iteration.status ?? 'pending',
        iteration.dispatchCount ?? 0,
      )
  }

  getProjectIdForMilestone(milestoneId: string): string | null {
    const row = this.db.prepare('SELECT project_id FROM milestones WHERE id = ?').get(milestoneId) as
      | { project_id: string }
      | undefined
    return row?.project_id ?? null
  }

  getCurrentIteration(milestoneId: string): (Iteration & { id: number }) | null {
    const row = this.db.prepare(
      "SELECT * FROM iterations WHERE milestone_id = ? AND status = 'in_progress' ORDER BY round DESC LIMIT 1"
    ).get(milestoneId) as IterationRow | undefined
    if (!row) return null
    return { ...iterRowToIteration(row, this.getSessionsForIteration(row.id)), id: row.id }
  }

  updateIterationStatus(id: number, status: string): void {
    const completedAt = status === 'passed' || status === 'failed' ? new Date().toISOString() : null
    this.db
      .prepare('UPDATE iterations SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?')
      .run(status, completedAt, id)
  }

  incrementDispatchCount(id: number): void {
    this.db.prepare('UPDATE iterations SET dispatch_count = dispatch_count + 1 WHERE id = ?').run(id)
  }
}
