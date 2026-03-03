import { randomUUID } from 'crypto'
import { createLogger } from '../../logger'
import { nowISO } from '../../lib/time'
import type { AgentRunner, RunResult } from '../../agents/AgentRunner'
import type { ProjectRepository } from '../../repositories/ProjectRepository'
import type { MilestoneRepository } from '../../repositories/MilestoneRepository'
import type { CommentRepository } from '../../repositories/CommentRepository'
import type { GitService } from '../../services/GitService'
import type { Milestone, IterationOutcome } from '../../../../src/types/index'
import type { SoulTask, Decision } from '../types'
import { Notifier } from '../notifier'
import { isRateLimitError, parseResetTime } from '../rateLimit'
import { ensureAnimaMcpConfig } from '../../mcp/mcpConfig'
import {
  buildDeveloperSystemPrompt,
  buildAcceptorSystemPrompt,
  buildDeveloperFirstMessage,
  buildAcceptorFirstMessage,
  buildDeveloperResumeMessage,
  buildAcceptorResumeMessage,
} from '../prompts'

const log = createLogger('milestone-execution')

const MAX_ITERATIONS = 20

// ── Types ────────────────────────────────────────────────────────────────────

export interface MilestoneExecutionTaskOptions {
  projectId: string
  projectPath: string
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  commentRepo: CommentRepository
  gitService: GitService
  agentRunner: AgentRunner
  notifier: Notifier
  mcpServerPath: string
  dbPath: string
}

type MilestoneExecutionDecision = Decision & { task: 'execute-milestone' }

// ── MilestoneExecutionTask ───────────────────────────────────────────────────

export class MilestoneExecutionTask implements SoulTask {
  private projectId: string
  private projectPath: string
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private commentRepo: CommentRepository
  private gitService: GitService
  private agentRunner: AgentRunner
  private notifier: Notifier
  private mcpServerPath: string
  private dbPath: string

  constructor(opts: MilestoneExecutionTaskOptions) {
    this.projectId = opts.projectId
    this.projectPath = opts.projectPath
    this.projectRepo = opts.projectRepo
    this.milestoneRepo = opts.milestoneRepo
    this.commentRepo = opts.commentRepo
    this.gitService = opts.gitService
    this.agentRunner = opts.agentRunner
    this.notifier = opts.notifier
    this.mcpServerPath = opts.mcpServerPath
    this.dbPath = opts.dbPath
  }

  async execute(decision: Decision, signal: AbortSignal): Promise<void> {
    const d = decision as MilestoneExecutionDecision
    let milestone = d.milestone

    // Prepare if needed (create branch, set in-progress)
    if (milestone.status === 'ready') {
      milestone = await this.prepare(milestone)
    }

    // Ensure .mcp.json configured
    ensureAnimaMcpConfig(this.projectPath, this.mcpServerPath, this.dbPath)

    const branch = `milestone/${milestone.id}`
    let devSessionId = randomUUID()
    let accSessionId = randomUUID()

    for (let round = 1; round <= MAX_ITERATIONS; round++) {
      if (signal.aborted) return

      const startedAt = nowISO()
      this.updateIterationState(milestone.id, round, startedAt, devSessionId, accSessionId)
      log.info('starting iteration', { milestone: milestone.id, round })

      try {
        // ── Developer ──
        const devResult = await this.runDeveloper(devSessionId, milestone.id, branch, round, signal)
        devSessionId = devResult.sessionId

        milestone = this.refresh(milestone)
        if (this.isComplete(milestone)) {
          this.recordIteration(milestone.id, round, 'passed', startedAt, devResult)
          await this.complete(milestone, round)
          return
        }

        if (signal.aborted) return

        // ── Acceptor ──
        const accResult = await this.runAcceptor(accSessionId, milestone.id, round, signal)
        accSessionId = accResult.sessionId

        milestone = this.refresh(milestone)
        const outcome: IterationOutcome = this.isComplete(milestone) ? 'passed' : 'rejected'
        this.recordIteration(milestone.id, round, outcome, startedAt, devResult, accResult)

        if (this.isComplete(milestone)) {
          await this.complete(milestone, round)
          return
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)

        if (isRateLimitError(msg)) {
          const resetAt = parseResetTime(msg)
          log.warn('rate limit detected', { resetAt })
          this.recordIteration(milestone.id, round, 'rate_limited', startedAt)
          this.projectRepo.patch(this.projectId, { status: 'rate_limited', rateLimitResetAt: resetAt })
          this.broadcastStatus()
          this.notifier.notifyRateLimited(resetAt)
          return
        }

        log.warn('iteration error, moving to next iteration', { error: msg })
        this.recordIteration(milestone.id, round, 'error', startedAt)
        milestone = this.refresh(milestone)
      }
    }

    this.handleMaxIterations(milestone, MAX_ITERATIONS)
  }

  // ── Agent interaction ────────────────────────────────────────────────────

  private async runDeveloper(
    sessionId: string,
    milestoneId: string,
    branch: string,
    round: number,
    signal: AbortSignal
  ): Promise<RunResult> {
    this.notifier.broadcastAgentEvent('developer', sessionId)

    if (round > 1) {
      return this.agentRunner.resume({
        projectPath: this.projectPath,
        sessionId,
        message: buildDeveloperResumeMessage(milestoneId),
        signal,
      })
    }

    return this.agentRunner.run({
      projectPath: this.projectPath,
      sessionId,
      systemPrompt: buildDeveloperSystemPrompt(),
      message: buildDeveloperFirstMessage(milestoneId, branch),
      signal,
    })
  }

  private async runAcceptor(
    sessionId: string,
    milestoneId: string,
    round: number,
    signal: AbortSignal
  ): Promise<RunResult> {
    this.notifier.broadcastAgentEvent('acceptor', sessionId)

    if (round > 1) {
      return this.agentRunner.resume({
        projectPath: this.projectPath,
        sessionId,
        message: buildAcceptorResumeMessage(milestoneId),
        signal,
      })
    }

    return this.agentRunner.run({
      projectPath: this.projectPath,
      sessionId,
      systemPrompt: buildAcceptorSystemPrompt(),
      message: buildAcceptorFirstMessage(milestoneId),
      signal,
    })
  }

  // ── Lifecycle helpers ────────────────────────────────────────────────────

  private async prepare(milestone: Milestone): Promise<Milestone> {
    const baseCommit = await this.gitService.createMilestoneBranch(this.projectPath, milestone.id)
    const updated: Milestone = {
      ...milestone,
      status: 'in-progress',
      baseCommit: milestone.baseCommit ?? baseCommit,
      iterationCount: milestone.iterationCount ?? 0,
    }
    this.milestoneRepo.save(this.projectId, updated)
    this.notifier.broadcastMilestoneUpdate(updated)
    return updated
  }

  private async complete(milestone: Milestone, round: number): Promise<void> {
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
            ...m, status: 'completed', completedAt: nowISO(), iterationCount: round,
          })
        }
        this.projectRepo.patch(this.projectId, { status: 'idle', currentIteration: null })
        this.broadcastStatus()
        this.notifier.notifyMilestoneCompleted(milestone.id)
      } catch (err) {
        log.warn('autoMerge failed, falling back to awaiting_review', { error: String(err) })
        if (m) {
          this.milestoneRepo.save(this.projectId, {
            ...m, status: 'awaiting_review', iterationCount: round,
          })
        }
        this.projectRepo.patch(this.projectId, { status: 'idle', currentIteration: null })
        this.broadcastStatus()
        this.notifier.notifyMilestoneAwaitingReview(milestone.id)
      }
    } else {
      if (m) {
        this.milestoneRepo.save(this.projectId, {
          ...m, status: 'awaiting_review', iterationCount: round,
        })
      }
      this.projectRepo.patch(this.projectId, { status: 'idle', currentIteration: null })
      this.broadcastStatus()
      this.notifier.notifyMilestoneAwaitingReview(milestone.id)
    }
  }

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

  // ── State helpers ──────────────────────────────────────────────────────

  private isComplete(milestone: Milestone): boolean {
    const ac = milestone.acceptanceCriteria
    return ac.length > 0 && ac.every((a) => a.status === 'passed')
  }

  private refresh(milestone: Milestone): Milestone {
    return this.milestoneRepo.getById(milestone.id) ?? milestone
  }

  private updateIterationState(milestoneId: string, round: number, startedAt: string, devSessionId: string, accSessionId: string): void {
    this.projectRepo.patch(this.projectId, {
      status: 'busy',
      currentIteration: { milestoneId, round, startedAt, developerSessionId: devSessionId, acceptorSessionId: accSessionId },
    })
    this.broadcastStatus()
  }

  private recordIteration(
    milestoneId: string,
    round: number,
    outcome: IterationOutcome,
    startedAt: string,
    devResult?: RunResult,
    accResult?: RunResult
  ): void {
    const totalTokens =
      (devResult ? devResult.usage.inputTokens + devResult.usage.outputTokens + devResult.usage.cacheReadTokens + devResult.usage.cacheCreationTokens : 0) +
      (accResult ? accResult.usage.inputTokens + accResult.usage.outputTokens + accResult.usage.cacheReadTokens + accResult.usage.cacheCreationTokens : 0)
    const totalCost = (devResult?.cost ?? 0) + (accResult?.cost ?? 0)
    const model = accResult?.model || devResult?.model

    this.milestoneRepo.addIteration({
      milestoneId,
      round,
      developerSessionId: devResult?.sessionId,
      acceptorSessionId: accResult?.sessionId,
      outcome,
      startedAt,
      completedAt: nowISO(),
      totalTokens,
      totalCost,
      model,
    })

    const m = this.milestoneRepo.getById(milestoneId)
    if (m) this.notifier.broadcastMilestoneUpdate(m)
  }

  private broadcastStatus(): void {
    const project = this.projectRepo.getById(this.projectId)
    if (project) this.notifier.broadcastStatus(project)
  }
}
