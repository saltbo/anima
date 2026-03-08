import { randomUUID } from 'crypto'
import { createLogger } from '../../logger'
import type { AgentRunner, RunResult } from '../../agents/AgentRunner'
import type { ProjectRepository } from '../../repositories/ProjectRepository'
import type { MilestoneRepository } from '../../repositories/MilestoneRepository'
import type { SessionRepository } from '../../repositories/SessionRepository'
import type { CommentRepository } from '../../repositories/CommentRepository'
import type { ActionRepository } from '../../repositories/ActionRepository'
import type { GitService } from '../../services/GitService'
import type { SoulTask, Decision } from '../types'
import { Notifier } from '../notifier'
import { AgentError } from '../../agents/AgentRunner'
import { isRateLimitCode, parseResetTime } from '../rateLimit'
import { getMcpConfigPath } from '../../mcp/mcpConfig'
import { MilestoneExecutionContext } from './MilestoneExecutionContext'
import { nowISO } from '../../lib/time'
import {
  buildSystemPrompt,
  buildPlannerFirstMessage,
  buildDispatchMessage,
} from '../prompts'

const log = createLogger('agent-dispatch')

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentDispatchTaskOptions {
  projectId: string
  projectPath: string
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  sessionRepo: SessionRepository
  commentRepo: CommentRepository
  actionRepo: ActionRepository
  gitService: GitService
  agentRunner: AgentRunner
  notifier: Notifier
}

type DispatchDecision = Decision & { task: 'dispatch-agent' }

// ── AgentDispatchTask ────────────────────────────────────────────────────────
//
// Unified agent dispatch: resolves the agent, builds prompt/message,
// calls AgentRunner, handles result. Delegates milestone execution
// lifecycle (git, iterations, sessions) to MilestoneExecutionContext.
//
// Handles both decision types:
//   - plan-milestone: first planner invocation (no milestone yet)
//   - dispatch-agent: @mention-driven dispatch on any milestone

export class AgentDispatchTask implements SoulTask {
  private projectId: string
  private projectPath: string
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private sessionRepo: SessionRepository
  private commentRepo: CommentRepository
  private agentRunner: AgentRunner
  private notifier: Notifier
  private executionCtx: MilestoneExecutionContext

  constructor(opts: AgentDispatchTaskOptions) {
    this.projectId = opts.projectId
    this.projectPath = opts.projectPath
    this.projectRepo = opts.projectRepo
    this.milestoneRepo = opts.milestoneRepo
    this.sessionRepo = opts.sessionRepo
    this.commentRepo = opts.commentRepo
    this.agentRunner = opts.agentRunner
    this.notifier = opts.notifier
    this.executionCtx = new MilestoneExecutionContext({
      projectId: opts.projectId,
      projectPath: opts.projectPath,
      projectRepo: opts.projectRepo,
      milestoneRepo: opts.milestoneRepo,
      sessionRepo: opts.sessionRepo,
      actionRepo: opts.actionRepo,
      gitService: opts.gitService,
      notifier: opts.notifier,
    })
  }

  async execute(decision: Decision, signal: AbortSignal): Promise<void> {
    if (decision.task === 'plan-milestone') {
      await this.runPlanMilestone(signal)
    } else if (decision.task === 'dispatch-agent') {
      await this.runDispatch(decision as DispatchDecision, signal)
    }
  }

  // ── plan-milestone: first planner invocation ────────────────────────────

  private async runPlanMilestone(signal: AbortSignal): Promise<void> {
    log.info('starting milestone planning', { project: this.projectId })

    try {
      const sessionId = randomUUID()

      // Record session
      this.sessionRepo.insert({
        id: sessionId,
        projectId: this.projectId,
        agentId: 'planner',
        startedAt: nowISO(),
        totalTokens: 0,
        totalCost: 0,
        status: 'running',
      })

      const result = await this.agentRunner.run({
        projectPath: this.projectPath,
        sessionId,
        systemPrompt: buildSystemPrompt('planner'),
        message: buildPlannerFirstMessage(this.projectId),
        mcpConfigPath: getMcpConfigPath(),
        signal,
      })

      if (signal.aborted) return

      // Update session usage
      const tokens =
        result.usage.inputTokens + result.usage.outputTokens +
        result.usage.cacheReadTokens + result.usage.cacheCreationTokens
      this.sessionRepo.updateUsage(sessionId, tokens, result.cost, result.model)

      log.info('planning agent finished', {
        project: this.projectId,
        sessionId,
        model: result.model,
        cost: result.cost,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      })
    } catch (err) {
      this.handleError(err)
    }
  }

  // ── dispatch-agent: @mention or auto dispatch ───────────────────────────

  private async runDispatch(d: DispatchDecision, signal: AbortSignal): Promise<void> {
    const milestone = this.milestoneRepo.getById(d.milestoneId)
    if (!milestone) {
      log.warn('milestone not found', { milestoneId: d.milestoneId })
      return
    }

    // Mark the triggering comment as dispatched
    if (d.commentId) {
      this.commentRepo.markMentionDispatched(d.commentId)
    }

    const needsExecution = milestone.status === 'ready' || milestone.status === 'in_progress'

    if (needsExecution) {
      await this.runWithExecutionContext(d, signal)
    } else {
      await this.runLightweight(d, milestone.status, signal)
    }
  }

  // ── Execution-phase dispatch (git + iteration + session resume) ─────────

  private async runWithExecutionContext(d: DispatchDecision, signal: AbortSignal): Promise<void> {
    const state = await this.executionCtx.before(d.milestoneId, d.agentId)
    if (!state) return

    const agentId = d.agentId
    const systemPrompt = buildSystemPrompt(agentId)
    const mentionComment = d.commentId
      ? this.commentRepo.getByMilestoneId(state.milestone.id).find((c) => c.id === d.commentId)
      : undefined
    const message = buildDispatchMessage(agentId, state.milestone.id, state.branch, mentionComment, state.milestone.status)

    try {
      let result: RunResult

      if (state.sessionId) {
        // Resume existing session
        log.info('resuming agent session', { agentId, sessionId: state.sessionId, milestoneId: state.milestone.id })
        this.notifier.broadcastAgentEvent(agentId === 'developer' ? 'developer' : 'reviewer', state.sessionId)
        result = await this.agentRunner.resume({
          projectPath: this.projectPath,
          sessionId: state.sessionId,
          message,
          mcpConfigPath: getMcpConfigPath(),
          signal,
        })
      } else {
        // New session
        const sessionId = randomUUID()
        log.info('starting new agent session', { agentId, sessionId, milestoneId: state.milestone.id })
        this.executionCtx.registerSession(state.iteration.id, state.milestone.id, agentId, sessionId, state.iteration.round)
        this.notifier.broadcastAgentEvent(agentId === 'developer' ? 'developer' : 'reviewer', sessionId)
        result = await this.agentRunner.run({
          projectPath: this.projectPath,
          sessionId,
          systemPrompt,
          message,
          mcpConfigPath: getMcpConfigPath(),
          signal,
        })
      }

      this.executionCtx.after(state, agentId, result)
    } catch (err) {
      this.handleError(err)
    }
  }

  // ── Lightweight dispatch (planning phase — no git, no iterations) ───────

  private async runLightweight(d: DispatchDecision, milestoneStatus: string, signal: AbortSignal): Promise<void> {
    const agentId = d.agentId
    const systemPrompt = buildSystemPrompt(agentId)
    const mentionComment = d.commentId
      ? this.commentRepo.getByMilestoneId(d.milestoneId).find((c) => c.id === d.commentId)
      : undefined
    const message = buildDispatchMessage(agentId, d.milestoneId, '', mentionComment, milestoneStatus)

    try {
      const sessionId = randomUUID()
      log.info('dispatching agent', { agentId, sessionId, milestoneId: d.milestoneId })

      // Record session
      this.sessionRepo.insert({
        id: sessionId,
        projectId: this.projectId,
        milestoneId: d.milestoneId,
        agentId,
        startedAt: nowISO(),
        totalTokens: 0,
        totalCost: 0,
        status: 'running',
      })

      const result = await this.agentRunner.run({
        projectPath: this.projectPath,
        sessionId,
        systemPrompt,
        message,
        mcpConfigPath: getMcpConfigPath(),
        signal,
      })

      // Update session usage
      const tokens =
        result.usage.inputTokens + result.usage.outputTokens +
        result.usage.cacheReadTokens + result.usage.cacheCreationTokens
      this.sessionRepo.updateUsage(sessionId, tokens, result.cost, result.model)

      log.info('agent finished', {
        agentId,
        milestoneId: d.milestoneId,
        model: result.model,
        cost: result.cost,
      })

      // Broadcast updated milestone
      const refreshed = this.milestoneRepo.getById(d.milestoneId)
      if (refreshed) this.notifier.broadcastMilestoneUpdate(refreshed)
    } catch (err) {
      this.handleError(err)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Handle agent error — always sets rate_limited to prevent immediate retry.
   * Never cancels the milestone; it stays in_progress for retry after cooldown.
   */
  private handleError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err)
    const code = err instanceof AgentError ? err.code : undefined

    if (isRateLimitCode(code)) {
      const resetAt = parseResetTime(msg)
      log.warn('rate limit detected', { code, resetAt })
      this.projectRepo.patch(this.projectId, { status: 'rate_limited', rateLimitResetAt: resetAt })
      const project = this.projectRepo.getById(this.projectId)
      if (project) this.notifier.broadcastStatus(project)
      this.notifier.notifyRateLimited(resetAt)
      return
    }

    // Unknown error — treat as transient, cool down before retrying
    const resetAt = parseResetTime(msg, Date.now())
    log.error('agent error, cooling down', { error: msg, code, resetAt })
    this.projectRepo.patch(this.projectId, { status: 'rate_limited', rateLimitResetAt: resetAt })
    const project = this.projectRepo.getById(this.projectId)
    if (project) this.notifier.broadcastStatus(project)
  }
}
