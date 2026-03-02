import type Database from 'better-sqlite3'
import type {
  Milestone,
  MilestoneTask,
  AcceptanceCriterion,
  Iteration,
  MilestoneStatus,
} from '../../../src/types/index'

interface MilestoneRow {
  id: string
  project_id: string
  title: string
  description: string
  status: string
  acceptance_criteria: string
  tasks: string
  inbox_item_ids: string
  review: string | null
  created_at: string
  completed_at: string | null
  iteration_count: number
  base_commit: string | null
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
}

function rowToMilestone(row: MilestoneRow, iterations: Iteration[]): Milestone {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as MilestoneStatus,
    acceptanceCriteria: JSON.parse(row.acceptance_criteria) as AcceptanceCriterion[],
    tasks: JSON.parse(row.tasks) as MilestoneTask[],
    inboxItemIds: JSON.parse(row.inbox_item_ids) as string[],
    review: row.review ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    iterationCount: row.iteration_count,
    iterations,
    baseCommit: row.base_commit ?? undefined,
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
  }
}

export class MilestoneRepository {
  constructor(private db: Database.Database) {}

  getByProjectId(projectId: string): Milestone[] {
    const rows = this.db
      .prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as MilestoneRow[]
    return rows.map((row) => {
      const iterRows = this.db
        .prepare('SELECT * FROM iterations WHERE milestone_id = ? ORDER BY round')
        .all(row.id) as IterationRow[]
      return rowToMilestone(row, iterRows.map(iterRowToIteration))
    })
  }

  getById(id: string): Milestone | null {
    const row = this.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow | undefined
    if (!row) return null
    const iterRows = this.db
      .prepare('SELECT * FROM iterations WHERE milestone_id = ? ORDER BY round')
      .all(id) as IterationRow[]
    return rowToMilestone(row, iterRows.map(iterRowToIteration))
  }

  save(projectId: string, milestone: Milestone): void {
    this.db
      .prepare(
        `INSERT INTO milestones
         (id, project_id, title, description, status, acceptance_criteria, tasks, inbox_item_ids, review, created_at, completed_at, iteration_count, base_commit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           acceptance_criteria = excluded.acceptance_criteria,
           tasks = excluded.tasks,
           inbox_item_ids = excluded.inbox_item_ids,
           review = excluded.review,
           completed_at = excluded.completed_at,
           iteration_count = excluded.iteration_count,
           base_commit = excluded.base_commit`
      )
      .run(
        milestone.id,
        projectId,
        milestone.title,
        milestone.description,
        milestone.status,
        JSON.stringify(milestone.acceptanceCriteria),
        JSON.stringify(milestone.tasks),
        JSON.stringify(milestone.inboxItemIds),
        milestone.review ?? null,
        milestone.createdAt,
        milestone.completedAt ?? null,
        milestone.iterationCount,
        milestone.baseCommit ?? null
      )
  }

  delete(id: string): void {
    // iterations cascade-deleted via FK
    this.db.prepare('DELETE FROM milestones WHERE id = ?').run(id)
  }

  updateTask(milestoneId: string, taskId: string, patch: Partial<MilestoneTask>): void {
    const milestone = this.getById(milestoneId)
    if (!milestone) return
    const tIdx = milestone.tasks.findIndex((t) => t.id === taskId)
    if (tIdx === -1) return
    milestone.tasks[tIdx] = { ...milestone.tasks[tIdx], ...patch }
    this.db
      .prepare('UPDATE milestones SET tasks = ? WHERE id = ?')
      .run(JSON.stringify(milestone.tasks), milestoneId)
  }

  addIteration(iteration: Iteration): void {
    this.db
      .prepare(
        `INSERT INTO iterations
         (milestone_id, round, developer_session_id, acceptor_session_id, outcome, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        iteration.milestoneId,
        iteration.round,
        iteration.developerSessionId ?? null,
        iteration.acceptorSessionId ?? null,
        iteration.outcome ?? null,
        iteration.startedAt ?? null,
        iteration.completedAt ?? null
      )
  }

  getProjectIdForMilestone(milestoneId: string): string | null {
    const row = this.db.prepare('SELECT project_id FROM milestones WHERE id = ?').get(milestoneId) as
      | { project_id: string }
      | undefined
    return row?.project_id ?? null
  }
}
