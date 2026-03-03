import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  Milestone,
  MilestoneTask,
  AcceptanceCriterion,
  AcceptanceCriterionStatus,
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
  total_tokens: number
  total_cost: number
  model: string | null
}

function rowToMilestone(row: MilestoneRow, iterations: Iteration[]): Milestone {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as MilestoneStatus,
    acceptanceCriteria: JSON.parse(row.acceptance_criteria) as AcceptanceCriterion[],
    tasks: JSON.parse(row.tasks) as MilestoneTask[],
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    iterationCount: row.iteration_count,
    iterations,
    totalTokens: iterations.reduce((sum, i) => sum + (i.totalTokens ?? 0), 0),
    totalCost: iterations.reduce((sum, i) => sum + (i.totalCost ?? 0), 0),
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
    totalTokens: row.total_tokens || undefined,
    totalCost: row.total_cost || undefined,
    model: row.model ?? undefined,
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
         (id, project_id, title, description, status, acceptance_criteria, tasks, created_at, completed_at, iteration_count, base_commit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           acceptance_criteria = excluded.acceptance_criteria,
           tasks = excluded.tasks,
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

  /** Upsert acceptance criteria by title + iteration. Returns updated milestone or null if not found. */
  mergeAcceptanceCriteria(
    milestoneId: string,
    criteria: Array<{ title: string; status: AcceptanceCriterionStatus; description?: string }>,
    iteration: number
  ): Milestone | null {
    const milestone = this.getById(milestoneId)
    if (!milestone) return null

    const ac = [...milestone.acceptanceCriteria]
    for (const c of criteria) {
      const idx = ac.findIndex((e) => e.title === c.title && e.iteration === iteration)
      if (idx >= 0) {
        ac[idx] = { ...ac[idx], status: c.status, description: c.description }
      } else {
        ac.push({ title: c.title, status: c.status, description: c.description, iteration })
      }
    }

    this.db
      .prepare('UPDATE milestones SET acceptance_criteria = ? WHERE id = ?')
      .run(JSON.stringify(ac), milestoneId)

    return { ...milestone, acceptanceCriteria: ac }
  }

  /** Upsert tasks by title. Returns updated milestone or null if not found. */
  mergeTasks(
    milestoneId: string,
    tasks: Array<{ title: string; completed: boolean; description?: string }>,
    iteration: number
  ): Milestone | null {
    const milestone = this.getById(milestoneId)
    if (!milestone) return null

    const existing = [...milestone.tasks]
    for (const t of tasks) {
      const idx = existing.findIndex((e) => e.title === t.title)
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], completed: t.completed, description: t.description }
      } else {
        existing.push({
          id: randomUUID(),
          title: t.title,
          completed: t.completed,
          description: t.description,
          order: existing.length,
          iteration,
        })
      }
    }

    this.db
      .prepare('UPDATE milestones SET tasks = ? WHERE id = ?')
      .run(JSON.stringify(existing), milestoneId)

    return { ...milestone, tasks: existing }
  }
}
