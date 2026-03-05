import { createLogger } from '../../logger'
import { nowISO } from '../../lib/time'
import type { MilestoneRepository } from '../../repositories/MilestoneRepository'
import type { SessionRepository } from '../../repositories/SessionRepository'
import type { ProjectRepository } from '../../repositories/ProjectRepository'
import type { GitService } from '../../services/GitService'
import type { Milestone, Iteration } from '../../../../src/types/index'
import type { RunResult } from '../../agents/AgentRunner'
import { Notifier } from '../notifier'

const log = createLogger('execution-context')

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionContextOptions {
  projectId: string
  projectPath: string
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  sessionRepo: SessionRepository
  gitService: GitService
  notifier: Notifier
}

/** Prepared execution state, returned by before() for use during and after agent run */
export interface ExecutionState {
  milestone: Milestone
  iteration: Iteration & { id: number }
  branch: string
  sessionId: string | undefined   // existing session to resume, or undefined for new
}

// ── MilestoneExecutionContext ────────────────────────────────────────────────
//
// Manages the execution-phase lifecycle around an agent run:
//   before(): prepare git branch, ensure iteration, resolve session
//   after():  update usage, check iteration approval, broadcast

export class MilestoneExecutionContext {
  private projectId: string
  private projectPath: string
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private sessionRepo: SessionRepository
  private gitService: GitService
  private notifier: Notifier

  constructor(opts: ExecutionContextOptions) {
    this.projectId = opts.projectId
    this.projectPath = opts.projectPath
    this.projectRepo = opts.projectRepo
    this.milestoneRepo = opts.milestoneRepo
    this.sessionRepo = opts.sessionRepo
    this.gitService = opts.gitService
    this.notifier = opts.notifier
  }

  /** Prepare everything needed before running an agent in execution phase */
  async before(milestoneId: string, agentId: string): Promise<ExecutionState | null> {
    let milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone) {
      log.warn('milestone not found', { milestoneId })
      return null
    }

    // Create branch and transition to in_progress if needed
    if (milestone.status === 'ready') {
      milestone = await this.prepareBranch(milestone)
    }

    const branch = `milestone/${milestone.id}`

    // Ensure current iteration exists
    let iteration = this.milestoneRepo.getCurrentIteration(milestone.id)
    if (!iteration) {
      const round = (milestone.iterationCount ?? 0) + 1
      this.milestoneRepo.addIteration({
        milestoneId: milestone.id,
        round,
        sessions: [],
        startedAt: nowISO(),
        status: 'in_progress',
      })
      this.milestoneRepo.save(this.projectId, {
        ...milestone,
        iterationCount: round,
      })
      iteration = this.milestoneRepo.getCurrentIteration(milestone.id)
      if (!iteration) {
        log.error('failed to create iteration')
        return null
      }
    }

    // Increment dispatch count
    this.milestoneRepo.incrementDispatchCount(iteration.id)

    // Resolve session for run vs resume
    const existingSession = this.sessionRepo.findForResume(iteration.id, agentId)

    return { milestone, iteration, branch, sessionId: existingSession?.id }
  }

  /** Register a new session ID on the agent_sessions table */
  registerSession(iterationId: number, milestoneId: string, agentId: string, sessionId: string): void {
    this.sessionRepo.insert({
      id: sessionId,
      projectId: this.projectId,
      milestoneId,
      iterationId,
      agentId,
      startedAt: nowISO(),
      totalTokens: 0,
      totalCost: 0,
      status: 'running',
    })
  }

  /** Process the result after an agent run completes */
  after(state: ExecutionState, agentId: string, result: RunResult): void {
    // Update session usage
    const tokens =
      result.usage.inputTokens + result.usage.outputTokens +
      result.usage.cacheReadTokens + result.usage.cacheCreationTokens
    this.sessionRepo.updateUsage(result.sessionId, tokens, result.cost, result.model)

    // Check if reviewer approved this iteration
    const milestone = this.milestoneRepo.getById(state.milestone.id)
    if (milestone && agentId === 'reviewer' && this.isIterationApproved(milestone)) {
      this.milestoneRepo.updateIterationStatus(state.iteration.id, 'passed')
      log.info('iteration approved by reviewer', { milestoneId: milestone.id })
    }

    // Broadcast updated milestone
    const refreshed = this.milestoneRepo.getById(state.milestone.id)
    if (refreshed) this.notifier.broadcastMilestoneUpdate(refreshed)
  }

  /** Handle error during execution phase — cancel stuck milestones */
  onError(milestoneId: string): void {
    const current = this.milestoneRepo.getById(milestoneId)
    if (current && current.status === 'in_progress') {
      this.milestoneRepo.save(this.projectId, { ...current, status: 'cancelled' })
      this.projectRepo.patch(this.projectId, { status: 'idle', currentIteration: null })
      const project = this.projectRepo.getById(this.projectId)
      if (project) this.notifier.broadcastStatus(project)
      this.notifier.broadcastMilestoneUpdate({ ...current, status: 'cancelled' })
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async prepareBranch(milestone: Milestone): Promise<Milestone> {
    const baseCommit = await this.gitService.createMilestoneBranch(this.projectPath, milestone.id)
    const updated: Milestone = {
      ...milestone,
      status: 'in_progress',
      baseCommit: milestone.baseCommit ?? baseCommit,
      iterationCount: milestone.iterationCount ?? 0,
    }
    this.milestoneRepo.save(this.projectId, updated)
    this.notifier.broadcastMilestoneUpdate(updated)
    return updated
  }

  private isIterationApproved(milestone: Milestone): boolean {
    const checks = milestone.checks
    if (checks.length === 0) return false
    const hasRejected = checks.some((c) => c.status === 'rejected')
    const hasPassed = checks.some((c) => c.status === 'passed')
    return hasPassed && !hasRejected
  }
}
