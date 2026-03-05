import type Database from 'better-sqlite3'
import type { AgentSession, AgentSessionStatus } from '../../../src/types/index'

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

function rowToSession(row: SessionRow): AgentSession {
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

export class SessionRepository {
  constructor(private db: Database.Database) {}

  insert(session: AgentSession): void {
    this.db
      .prepare(
        `INSERT INTO agent_sessions
         (id, project_id, milestone_id, iteration_id, agent_id, started_at, completed_at, total_tokens, total_cost, model, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.projectId,
        session.milestoneId ?? null,
        session.iterationId ?? null,
        session.agentId,
        session.startedAt,
        session.completedAt ?? null,
        session.totalTokens,
        session.totalCost,
        session.model ?? null,
        session.status
      )
  }

  updateUsage(id: string, tokens: number, cost: number, model: string): void {
    this.db
      .prepare(
        'UPDATE agent_sessions SET total_tokens = total_tokens + ?, total_cost = total_cost + ?, model = ?, status = ?, completed_at = ? WHERE id = ?'
      )
      .run(tokens, cost, model, 'completed', new Date().toISOString(), id)
  }

  updateStatus(id: string, status: AgentSessionStatus): void {
    this.db
      .prepare('UPDATE agent_sessions SET status = ?, completed_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id)
  }

  getByIterationId(iterationId: number): AgentSession[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_sessions WHERE iteration_id = ? ORDER BY started_at')
      .all(iterationId) as SessionRow[]
    return rows.map(rowToSession)
  }

  getByMilestoneId(milestoneId: string): AgentSession[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_sessions WHERE milestone_id = ? ORDER BY started_at')
      .all(milestoneId) as SessionRow[]
    return rows.map(rowToSession)
  }

  getByProjectId(projectId: string): AgentSession[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_sessions WHERE project_id = ? ORDER BY started_at')
      .all(projectId) as SessionRow[]
    return rows.map(rowToSession)
  }

  /** Find the latest session for a given iteration + agent (for resume) */
  findForResume(iterationId: number, agentId: string): AgentSession | null {
    const row = this.db
      .prepare(
        'SELECT * FROM agent_sessions WHERE iteration_id = ? AND agent_id = ? ORDER BY started_at DESC LIMIT 1'
      )
      .get(iterationId, agentId) as SessionRow | undefined
    return row ? rowToSession(row) : null
  }

  /** Sum tokens for a milestone */
  sumTokensByMilestone(milestoneId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(total_tokens), 0) as total FROM agent_sessions WHERE milestone_id = ?')
      .get(milestoneId) as { total: number }
    return row.total
  }

  /** Sum cost for a milestone */
  sumCostByMilestone(milestoneId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(total_cost), 0) as total FROM agent_sessions WHERE milestone_id = ?')
      .get(milestoneId) as { total: number }
    return row.total
  }

  /** Sum tokens for a project */
  sumTokensByProject(projectId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(total_tokens), 0) as total FROM agent_sessions WHERE project_id = ?')
      .get(projectId) as { total: number }
    return row.total
  }

  /** Sum cost for a project */
  sumCostByProject(projectId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(total_cost), 0) as total FROM agent_sessions WHERE project_id = ?')
      .get(projectId) as { total: number }
    return row.total
  }
}
