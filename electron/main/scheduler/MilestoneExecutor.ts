import { createLogger } from '../logger'
import { nowISO } from '../lib/time'
import type { ConversationAgent } from '../services/types'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { GitService } from '../services/GitService'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { Milestone, Iteration, IterationOutcome } from '../../../src/types/index'
import type { AgentEvent } from '../../../src/types/agent'
import { Notifier } from './notifier'
import { isRateLimitError, parseResetTime } from './rateLimit'
import { finalizeAcceptorCriteria } from './todoCapture'
import { ensureAnimaMcpConfig } from '../mcp/mcpConfig'
import {
  buildDeveloperSystemPrompt,
  buildAcceptorSystemPrompt,
  buildDeveloperFirstMessage,
  buildAcceptorFirstMessage,
  buildContinueMessage,
} from './prompts'

const log = createLogger('executor')

const MAX_ITERATIONS = 20
const MAX_ROUNDS_PER_ITERATION = 5

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutorOptions {
  projectId: string
  projectPath: string
  mcpServerPath: string
  dbPath: string
  notifier: Notifier
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  commentRepo: CommentRepository
  gitService: GitService
  conversationAgent: ConversationAgent
  onRateLimit: (resetAt: string) => void
  onComplete: () => void
}

export type ExecutorResult =
  | { outcome: 'completed' }
  | { outcome: 'max_iterations' }
  | { outcome: 'rate_limited'; resetAt: string }
  | { outcome: 'aborted' }
  | { outcome: 'error'; message: string }

// ── MilestoneExecutor ─────────────────────────────────────────────────────────

export class MilestoneExecutor {
  private projectId: string
  private projectPath: string
  private mcpServerPath: string
  private dbPath: string
  private notifier: Notifier
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private commentRepo: CommentRepository
  private gitService: GitService
  private agent: ConversationAgent
  private onRateLimit: (resetAt: string) => void
  private onComplete: () => void
  private aborted = false
  private activeAgentKeys: string[] = []
  private capturedSessionIds: { developerSessionId?: string; acceptorSessionId?: string } = {}
  private capturedUsage = { totalTokens: 0, totalCost: 0, model: undefined as string | undefined }

  constructor(options: ExecutorOptions) {
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.mcpServerPath = options.mcpServerPath
    this.dbPath = options.dbPath
    this.notifier = options.notifier
    this.projectRepo = options.projectRepo
    this.milestoneRepo = options.milestoneRepo
    this.commentRepo = options.commentRepo
    this.gitService = options.gitService
    this.agent = options.conversationAgent
    this.onRateLimit = options.onRateLimit
    this.onComplete = options.onComplete
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async execute(milestone: Milestone, _initialFeedback = ''): Promise<ExecutorResult> {
    // Ensure .mcp.json is configured for the agent to discover Anima tools
    ensureAnimaMcpConfig(this.projectPath, this.mcpServerPath, this.dbPath)

    for (let attempt = 0; attempt < MAX_ITERATIONS; attempt++) {
      if (this.aborted) return { outcome: 'aborted' }

      const round = milestone.iterations.length + 1

      if (round > MAX_ITERATIONS) {
        this.handleMaxIterations(milestone, round)
        return { outcome: 'max_iterations' }
      }

      const startedAt = nowISO()
      this.updateIterationState(milestone.id, round, startedAt)
      log.info('starting iteration', { milestone: milestone.id, round, attempt: attempt + 1 })

      const result = await this.runIteration(milestone, round)

      if (result.type === 'completed') {
        this.recordIteration(milestone.id, round, 'passed', startedAt)
        await this.completeMilestone(milestone, round)
        return { outcome: 'completed' }
      }
      if (result.type === 'rate_limited') {
        this.recordIteration(milestone.id, round, 'rate_limited', startedAt)
        return { outcome: 'rate_limited', resetAt: result.resetAt }
      }

      const outcome: IterationOutcome = this.aborted ? 'cancelled' : 'rejected'
      this.recordIteration(milestone.id, round, outcome, startedAt)

      milestone = this.milestoneRepo.getById(milestone.id) ?? milestone
    }

    this.handleMaxIterations(milestone, milestone.iterations.length)
    return { outcome: 'max_iterations' }
  }

  abort(): void {
    this.aborted = true
    for (const key of this.activeAgentKeys) {
      this.agent.stop(key)
    }
    this.activeAgentKeys = []
  }

  // ── Iteration: dev → check → acc → check, with relay rounds ────────────

  private async runIteration(
    milestone: Milestone,
    iteration: number
  ): Promise<{ type: 'completed' } | { type: 'rejected' } | { type: 'rate_limited'; resetAt: string }> {
    const devKey = `${this.projectId}:${milestone.id}-dev-${iteration}`
    const accKey = `${this.projectId}:${milestone.id}-acc-${iteration}`
    this.activeAgentKeys = [devKey, accKey]
    this.capturedSessionIds = {}
    this.capturedUsage = { totalTokens: 0, totalCost: 0, model: undefined }

    const branch = `milestone/${milestone.id}`

    try {
      // Round 1: run developer
      await this.runRole('developer', devKey, milestone.id, branch, iteration)
      milestone = this.refresh(milestone)
      if (this.isComplete(milestone)) return { type: 'completed' }

      // Round 1: run acceptor
      await this.runRole('acceptor', accKey, milestone.id, branch, iteration)
      this.finalizeAC(milestone, iteration)
      milestone = this.refresh(milestone)
      if (this.isComplete(milestone)) return { type: 'completed' }

      // Relay rounds 2..N
      for (let relay = 2; relay <= MAX_ROUNDS_PER_ITERATION; relay++) {
        if (this.aborted) return { type: 'rejected' }

        await this.continueRole('developer', devKey, milestone.id)
        milestone = this.refresh(milestone)
        if (this.isComplete(milestone)) return { type: 'completed' }

        await this.continueRole('acceptor', accKey, milestone.id)
        this.finalizeAC(milestone, iteration)
        milestone = this.refresh(milestone)
        if (this.isComplete(milestone)) return { type: 'completed' }
      }

      return { type: 'rejected' }
    } catch (err) {
      return this.handleIterationError(err)
    } finally {
      this.activeAgentKeys = []
      this.agent.stop(devKey)
      this.agent.stop(accKey)
    }
  }

  // ── Agent interaction ─────────────────────────────────────────────────────

  private async runRole(
    role: 'developer' | 'acceptor',
    agentKey: string,
    milestoneId: string,
    branch: string,
    iteration: number
  ): Promise<void> {
    const systemPrompt = role === 'developer' ? buildDeveloperSystemPrompt() : buildAcceptorSystemPrompt()
    const firstMessage = role === 'developer'
      ? buildDeveloperFirstMessage({ milestoneId, branch, iterationCount: iteration })
      : buildAcceptorFirstMessage({ milestoneId, iterationCount: iteration })

    await this.agent.run(agentKey, {
      projectPath: this.projectPath,
      systemPrompt,
      firstMessage,
      onEvent: (event) => this.handleAgentEvent(role, agentKey, event),
    })
  }

  private async continueRole(
    role: 'developer' | 'acceptor',
    agentKey: string,
    milestoneId: string
  ): Promise<void> {
    const message = buildContinueMessage(role, milestoneId)
    await this.agent.continue(agentKey, message, (event) =>
      this.handleAgentEvent(role, agentKey, event)
    )
  }

  private handleAgentEvent(role: 'developer' | 'acceptor', agentKey: string, event: AgentEvent): void {
    if (event.event === 'system') {
      log.info(`${role} system event`, { sessionId: event.sessionId, agentKey })
      this.notifier.broadcastAgentEvent(role, agentKey)
      const sessionKey = role === 'developer' ? 'developerSessionId' : 'acceptorSessionId'
      this.capturedSessionIds[sessionKey] = event.sessionId
      this.capturedUsage.model = event.model || this.capturedUsage.model

      const project = this.projectRepo.getById(this.projectId)
      const cur = project?.currentIteration
      if (cur) {
        this.projectRepo.patch(this.projectId, {
          currentIteration: { ...cur, [sessionKey]: event.sessionId },
        })
      }
    }
    if (event.event === 'done') {
      this.accumulateUsage(event)
    }
  }

  // ── AC checking ───────────────────────────────────────────────────────────

  private isComplete(milestone: Milestone): boolean {
    const ac = milestone.acceptanceCriteria
    return ac.length > 0 && ac.every((a) => a.status === 'passed')
  }

  private refresh(milestone: Milestone): Milestone {
    return this.milestoneRepo.getById(milestone.id) ?? milestone
  }

  /** Convert in_progress AC items to rejected after acceptor finishes */
  private finalizeAC(milestone: Milestone, iteration: number): void {
    const latest = this.milestoneRepo.getById(milestone.id)
    if (!latest) return
    const updated = finalizeAcceptorCriteria(latest, iteration)
    if (updated) {
      this.milestoneRepo.save(this.projectId, updated)
      this.notifier.broadcastMilestoneUpdate(updated)
    }
  }

  // ── Error handling ────────────────────────────────────────────────────────

  private handleIterationError(
    err: unknown
  ): { type: 'rejected' } | { type: 'rate_limited'; resetAt: string } {
    const msg = err instanceof Error ? err.message : String(err)
    if (isRateLimitError(msg)) {
      const resetAt = parseResetTime(msg)
      log.warn('rate limit detected', { resetAt })
      this.projectRepo.patch(this.projectId, { status: 'rate_limited', rateLimitResetAt: resetAt })
      this.broadcastStatus()
      this.notifier.notifyRateLimited(resetAt)
      this.onRateLimit(resetAt)
      return { type: 'rate_limited', resetAt }
    }
    log.warn('iteration error, moving to next iteration', { error: msg })
    return { type: 'rejected' }
  }

  // ── State transitions ─────────────────────────────────────────────────────

  private handleMaxIterations(milestone: Milestone, round: number): void {
    log.warn('max iterations reached', { milestone: milestone.id })
    const m = this.milestoneRepo.getById(milestone.id)
    if (m) {
      this.milestoneRepo.save(this.projectId, { ...m, iterationCount: round })
    }
    const project = this.projectRepo.getById(this.projectId)
    const cur = project?.currentIteration
    this.projectRepo.patch(this.projectId, {
      status: 'paused',
      currentIteration: cur ?? { milestoneId: milestone.id, round },
    })
    this.broadcastStatus()
    this.notifier.notifyIterationPaused(milestone.id, 'max_iterations')
  }

  private async completeMilestone(milestone: Milestone, round: number): Promise<void> {
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
            ...m,
            status: 'completed',
            completedAt: nowISO(),
            iterationCount: round,
          })
        }
        this.projectRepo.patch(this.projectId, { status: 'sleeping', currentIteration: null })
        this.broadcastStatus()
        this.notifier.notifyMilestoneCompleted(milestone.id)
        this.onComplete()
      } catch (err) {
        log.warn('autoMerge failed, falling back to awaiting_review', { error: String(err) })
        if (m) {
          this.milestoneRepo.save(this.projectId, {
            ...m,
            status: 'awaiting_review',
            iterationCount: round,
          })
        }
        this.projectRepo.patch(this.projectId, { status: 'sleeping', currentIteration: null })
        this.broadcastStatus()
        this.notifier.notifyMilestoneAwaitingReview(milestone.id)
      }
    } else {
      if (m) {
        this.milestoneRepo.save(this.projectId, {
          ...m,
          status: 'awaiting_review',
          iterationCount: round,
        })
      }
      this.projectRepo.patch(this.projectId, { status: 'sleeping', currentIteration: null })
      this.broadcastStatus()
      this.notifier.notifyMilestoneAwaitingReview(milestone.id)
    }
  }

  private updateIterationState(milestoneId: string, round: number, startedAt: string): void {
    const iter: Iteration = { milestoneId, round, startedAt }
    this.projectRepo.patch(this.projectId, { status: 'awake', currentIteration: iter })
    this.broadcastStatus()
  }

  private accumulateUsage(event: AgentEvent & { event: 'done' }): void {
    if (event.usage) {
      this.capturedUsage.totalTokens += event.usage.inputTokens + event.usage.outputTokens + event.usage.cacheReadTokens + event.usage.cacheCreationTokens
    }
    if (event.totalCostUsd) this.capturedUsage.totalCost += event.totalCostUsd
    if (event.model) this.capturedUsage.model = event.model
  }

  private recordIteration(milestoneId: string, round: number, outcome: IterationOutcome, startedAt: string): void {
    const { totalTokens, totalCost, model } = this.capturedUsage
    log.info('recordIteration', {
      milestoneId,
      round,
      outcome,
      devSessionId: this.capturedSessionIds.developerSessionId ?? 'NONE',
      accSessionId: this.capturedSessionIds.acceptorSessionId ?? 'NONE',
      totalTokens,
      totalCost,
      model,
    })
    this.milestoneRepo.addIteration({
      milestoneId,
      round,
      developerSessionId: this.capturedSessionIds.developerSessionId,
      acceptorSessionId: this.capturedSessionIds.acceptorSessionId,
      outcome,
      startedAt,
      completedAt: nowISO(),
      totalTokens,
      totalCost,
      model,
    })

    const m = this.milestoneRepo.getById(milestoneId)
    if (m) {
      this.notifier.broadcastMilestoneUpdate(m)
    }
  }

  private broadcastStatus(): void {
    const project = this.projectRepo.getById(this.projectId)
    if (project) this.notifier.broadcastStatus(project)
  }
}
