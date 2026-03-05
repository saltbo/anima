import { randomUUID } from 'crypto'
import { createLogger } from '../../logger'
import { nowISO } from '../../lib/time'
import type { AgentRunner, RunResult } from '../../agents/AgentRunner'
import type { ProjectRepository } from '../../repositories/ProjectRepository'
import type { MilestoneRepository } from '../../repositories/MilestoneRepository'
import type { CommentRepository } from '../../repositories/CommentRepository'
import type { GitService } from '../../services/GitService'
import type { Milestone } from '../../../../src/types/index'
import type { SoulTask, Decision } from '../types'
import { Notifier } from '../notifier'
import { isRateLimitError, parseResetTime } from '../rateLimit'
import { getMcpConfigPath } from '../../mcp/mcpConfig'
import {
  buildDeveloperSystemPrompt,
  buildAcceptorSystemPrompt,
  buildDispatchMessage,
} from '../prompts'

const log = createLogger('milestone-agent')

// ── Types ────────────────────────────────────────────────────────────────────

export interface MilestoneAgentTaskOptions {
  projectId: string
  projectPath: string
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  commentRepo: CommentRepository
  gitService: GitService
  agentRunner: AgentRunner
  notifier: Notifier
}

type DispatchAgentDecision = Decision & { task: 'dispatch-agent' }

// ── MilestoneAgentTask ───────────────────────────────────────────────────────

export class MilestoneAgentTask implements SoulTask {
  private projectId: string
  private projectPath: string
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private commentRepo: CommentRepository
  private gitService: GitService
  private agentRunner: AgentRunner
  private notifier: Notifier

  constructor(opts: MilestoneAgentTaskOptions) {
    this.projectId = opts.projectId
    this.projectPath = opts.projectPath
    this.projectRepo = opts.projectRepo
    this.milestoneRepo = opts.milestoneRepo
    this.commentRepo = opts.commentRepo
    this.gitService = opts.gitService
    this.agentRunner = opts.agentRunner
    this.notifier = opts.notifier
  }

  async execute(decision: Decision, signal: AbortSignal): Promise<void> {
    const d = decision as DispatchAgentDecision
    let milestone = this.milestoneRepo.getById(d.milestoneId)
    if (!milestone) {
      log.warn('milestone not found', { milestoneId: d.milestoneId })
      return
    }

    // Prepare if needed (create branch, set in-progress)
    if (milestone.status === 'ready') {
      milestone = await this.prepare(milestone)
    }

    const mcpConfigPath = getMcpConfigPath()
    const branch = `milestone/${milestone.id}`
    const agentId = d.agentId

    // Get or create current iteration
    let iteration = this.milestoneRepo.getCurrentIteration(milestone.id)
    if (!iteration) {
      // Create new iteration
      const round = (milestone.iterationCount ?? 0) + 1
      this.milestoneRepo.addIteration({
        milestoneId: milestone.id,
        round,
        startedAt: nowISO(),
        status: 'in_progress',
      })
      // Update milestone iteration count
      this.milestoneRepo.save(this.projectId, {
        ...milestone,
        iterationCount: round,
      })
      iteration = this.milestoneRepo.getCurrentIteration(milestone.id)
      if (!iteration) {
        log.error('failed to create iteration')
        return
      }
    }

    // Increment dispatch count
    this.milestoneRepo.incrementDispatchCount(iteration.id)

    // Mark the triggering comment as dispatched
    if (d.commentId) {
      this.commentRepo.markMentionDispatched(d.commentId)
    }

    // Determine run vs resume
    const sessionField = agentId === 'developer' ? 'developer' : 'acceptor'
    const existingSessionId =
      sessionField === 'developer' ? iteration.developerSessionId : iteration.acceptorSessionId

    const systemPrompt =
      agentId === 'developer' ? buildDeveloperSystemPrompt() : buildAcceptorSystemPrompt()

    // Build the dispatch message
    const mentionComment = d.commentId
      ? this.commentRepo.getByMilestoneId(milestone.id).find((c) => c.id === d.commentId)
      : undefined
    const message = buildDispatchMessage(agentId, milestone.id, branch, mentionComment)

    try {
      let result: RunResult

      if (existingSessionId) {
        // Resume existing session
        log.info('resuming agent session', { agentId, sessionId: existingSessionId, milestoneId: milestone.id })
        this.notifier.broadcastAgentEvent(sessionField === 'developer' ? 'developer' : 'acceptor', existingSessionId)
        result = await this.agentRunner.resume({
          projectPath: this.projectPath,
          sessionId: existingSessionId,
          message,
          mcpConfigPath,
          signal,
        })
      } else {
        // New session
        const sessionId = randomUUID()
        log.info('starting new agent session', { agentId, sessionId, milestoneId: milestone.id })
        this.milestoneRepo.updateIterationSession(iteration.id, sessionField, sessionId)
        this.notifier.broadcastAgentEvent(sessionField === 'developer' ? 'developer' : 'acceptor', sessionId)
        result = await this.agentRunner.run({
          projectPath: this.projectPath,
          sessionId,
          systemPrompt,
          message,
          mcpConfigPath,
          signal,
        })
      }

      // Update iteration usage
      const tokens =
        result.usage.inputTokens + result.usage.outputTokens +
        result.usage.cacheReadTokens + result.usage.cacheCreationTokens
      this.milestoneRepo.updateIterationUsage(iteration.id, tokens, result.cost, result.model)

      // Refresh and check completion
      milestone = this.refresh(milestone)
      if (this.isComplete(milestone)) {
        // Mark iteration as passed
        this.milestoneRepo.updateIterationStatus(iteration.id, 'passed')
        this.milestoneRepo.addIteration({
          ...iteration,
          status: 'passed',
          outcome: 'passed',
          completedAt: nowISO(),
        })
        await this.complete(milestone)
      }

      // Broadcast updated milestone
      const refreshed = this.milestoneRepo.getById(milestone.id)
      if (refreshed) this.notifier.broadcastMilestoneUpdate(refreshed)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)

      if (isRateLimitError(msg)) {
        const resetAt = parseResetTime(msg)
        log.warn('rate limit detected', { resetAt })
        this.projectRepo.patch(this.projectId, { status: 'rate_limited', rateLimitResetAt: resetAt })
        this.broadcastStatus()
        this.notifier.notifyRateLimited(resetAt)
        return
      }

      log.warn('agent execution error', { error: msg, agentId, milestoneId: milestone.id })
    }
  }

  // ── Lifecycle helpers ────────────────────────────────────────────────────

  private async prepare(milestone: Milestone): Promise<Milestone> {
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

  private async complete(milestone: Milestone): Promise<void> {
    log.info('milestone completed!', { milestone: milestone.id })
    const m = this.milestoneRepo.getById(milestone.id)
    const project = this.projectRepo.getById(this.projectId)

    if (project?.autoMerge) {
      try {
        const defaultBranch = await this.gitService.getDefaultBranch(this.projectPath)
        const branch = `milestone/${milestone.id}`
        await this.gitService.squashMerge(this.projectPath, branch, defaultBranch, `feat: ${milestone.title}`)
        await this.gitService.deleteBranch(this.projectPath, branch)
        if (m) {
          this.milestoneRepo.save(this.projectId, {
            ...m, status: 'completed', completedAt: nowISO(),
          })
        }
        this.projectRepo.patch(this.projectId, { status: 'idle', currentIteration: null })
        this.broadcastStatus()
        this.notifier.notifyMilestoneCompleted(milestone.id)
      } catch (err) {
        log.warn('autoMerge failed, falling back to in_review', { error: String(err) })
        if (m) {
          this.milestoneRepo.save(this.projectId, { ...m, status: 'in_review' })
        }
        this.projectRepo.patch(this.projectId, { status: 'idle', currentIteration: null })
        this.broadcastStatus()
        this.notifier.notifyMilestoneAwaitingReview(milestone.id)
      }
    } else {
      if (m) {
        this.milestoneRepo.save(this.projectId, { ...m, status: 'in_review' })
      }
      this.projectRepo.patch(this.projectId, { status: 'idle', currentIteration: null })
      this.broadcastStatus()
      this.notifier.notifyMilestoneAwaitingReview(milestone.id)
    }
  }

  // ── State helpers ──────────────────────────────────────────────────────

  private isComplete(milestone: Milestone): boolean {
    const checks = milestone.checks
    return checks.length > 0 && checks.every((c) => c.status === 'passed')
  }

  private refresh(milestone: Milestone): Milestone {
    return this.milestoneRepo.getById(milestone.id) ?? milestone
  }

  private broadcastStatus(): void {
    const project = this.projectRepo.getById(this.projectId)
    if (project) this.notifier.broadcastStatus(project)
  }
}
