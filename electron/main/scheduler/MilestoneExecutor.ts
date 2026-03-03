import { createLogger } from '../logger'
import { nowISO } from '../lib/time'
import type { ConversationAgent } from '../services/types'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { GitService } from '../services/GitService'
import type { Milestone, Iteration, IterationOutcome } from '../../../src/types/index'
import type { AgentEvent } from '../../../src/types/agent'
import { Notifier } from './notifier'
import { isRateLimitError, parseResetTime } from './rateLimit'
import { parseTodoWrite, captureDeveloperTodos, captureAcceptorTodos, type TodoItem } from './todoCapture'
import {
  buildDeveloperSystemPrompt,
  buildAcceptorSystemPrompt,
  buildDeveloperFirstMessage,
  buildAcceptorMessage,
  buildDeveloperFixMessage,
  buildAcceptorFollowUpMessage,
} from './prompts'

const log = createLogger('executor')

const MAX_ITERATIONS = 20
const MAX_ROUNDS_PER_ITERATION = 5

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutorOptions {
  projectId: string
  projectPath: string
  notifier: Notifier
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
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

type BattleResult =
  | { complete: true }
  | { complete: false; feedback: string }
  | { complete: false; rateLimited: true; resetAt: string }

// ── MilestoneExecutor ─────────────────────────────────────────────────────────

export class MilestoneExecutor {
  private projectId: string
  private projectPath: string
  private notifier: Notifier
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
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
    this.notifier = options.notifier
    this.projectRepo = options.projectRepo
    this.milestoneRepo = options.milestoneRepo
    this.gitService = options.gitService
    this.agent = options.conversationAgent
    this.onRateLimit = options.onRateLimit
    this.onComplete = options.onComplete
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async execute(milestone: Milestone): Promise<ExecutorResult> {
    let feedback = ''

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

      const result = await this.runBattle(milestone, round, feedback)

      if (result.complete) {
        this.recordIteration(milestone.id, round, 'passed', startedAt)
        this.completeMilestone(milestone, round)
        return { outcome: 'completed' }
      }
      if ('rateLimited' in result) {
        this.recordIteration(milestone.id, round, 'rate_limited', startedAt)
        return { outcome: 'rate_limited', resetAt: result.resetAt }
      }

      const outcome: IterationOutcome = this.aborted ? 'cancelled' : 'rejected'
      this.recordIteration(milestone.id, round, outcome, startedAt)

      feedback = result.feedback
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

  // ── Battle: bridge two agents ───────────────────────────────────────────

  private async runBattle(
    milestone: Milestone,
    iteration: number,
    feedback: string
  ): Promise<BattleResult> {
    const devKey = `${this.projectId}:${milestone.id}-dev-${iteration}`
    const accKey = `${this.projectId}:${milestone.id}-acc-${iteration}`
    this.activeAgentKeys = [devKey, accKey]
    this.capturedSessionIds = {}
    this.capturedUsage = { totalTokens: 0, totalCost: 0, model: undefined }

    try {
      // 1. Developer works
      const branch = `milestone/${milestone.id}`
      const commitLog = await this.gitService.getCommitLog(this.projectPath, branch)
      const uncommitted = await this.gitService.hasUncommittedChanges(this.projectPath)

      const devReport = await this.agent.run(devKey, {
        projectPath: this.projectPath,
        systemPrompt: buildDeveloperSystemPrompt(),
        firstMessage: buildDeveloperFirstMessage({
          projectPath: this.projectPath,
          branch,
          milestoneId: milestone.id,
          milestoneTitle: milestone.title,
          milestoneDescription: milestone.description,
          iterationCount: iteration,
          commitLog,
          hasUncommitted: uncommitted,
          remainingFeedback: feedback,
        }),
        onEvent: (event) => {
          if (event.event === 'system') {
            log.info('developer system event', { sessionId: event.sessionId, devKey })
            this.notifier.broadcastAgentEvent('developer', devKey)
            this.capturedSessionIds.developerSessionId = event.sessionId
            this.capturedUsage.model = event.model || this.capturedUsage.model
            const project = this.projectRepo.getById(this.projectId)
            const cur = project?.currentIteration
            if (cur) this.projectRepo.patch(this.projectId, { currentIteration: { ...cur, developerSessionId: event.sessionId } })
          }
          if (event.event === 'done') {
            this.accumulateUsage(event)
          }
          if (event.event === 'tool_use' && event.toolName === 'TodoWrite') {
            const todos = parseTodoWrite(event.toolInput)
            const updated = captureDeveloperTodos(milestone, todos, iteration)
            if (updated) {
              this.milestoneRepo.save(this.projectId, updated)
              this.notifier.broadcastMilestoneUpdate(updated)
            }
          }
        },
      })

      // Refresh milestone after developer phase
      milestone = this.milestoneRepo.getById(milestone.id) ?? milestone

      // 2. Acceptor reviews
      const roundTodos: TodoItem[] = []
      const onAccEvent = (event: AgentEvent, todos: TodoItem[]): void => {
        if (event.event === 'system') {
          log.info('acceptor system event', { sessionId: event.sessionId, accKey })
          this.notifier.broadcastAgentEvent('acceptor', accKey)
          this.capturedSessionIds.acceptorSessionId = event.sessionId
          this.capturedUsage.model = event.model || this.capturedUsage.model
          const project = this.projectRepo.getById(this.projectId)
          const cur = project?.currentIteration
          if (cur) this.projectRepo.patch(this.projectId, { currentIteration: { ...cur, acceptorSessionId: event.sessionId } })
        }
        if (event.event === 'done') {
          this.accumulateUsage(event)
        }
        if (event.event === 'tool_use' && event.toolName === 'TodoWrite') {
          const parsed = parseTodoWrite(event.toolInput)
          todos.splice(0, todos.length, ...parsed)
          const updated = captureAcceptorTodos(milestone, parsed, iteration)
          if (updated) {
            this.milestoneRepo.save(this.projectId, updated)
            this.notifier.broadcastMilestoneUpdate(updated)
          }
        }
      }

      let accReport = await this.agent.run(accKey, {
        projectPath: this.projectPath,
        systemPrompt: buildAcceptorSystemPrompt(),
        firstMessage: buildAcceptorMessage(milestone, devReport, iteration, this.projectPath),
        onEvent: (e) => onAccEvent(e, roundTodos),
      })

      if (this.allPassed(roundTodos)) return { complete: true }

      // 3. Relay loop
      for (let round = 2; round <= MAX_ROUNDS_PER_ITERATION; round++) {
        if (this.aborted) return { complete: false, feedback: accReport }

        const fixReport = await this.agent.continue(devKey, buildDeveloperFixMessage(accReport))

        const nextTodos: TodoItem[] = []
        accReport = await this.agent.continue(
          accKey,
          buildAcceptorFollowUpMessage(fixReport, round),
          (e) => onAccEvent(e, nextTodos)
        )

        if (this.allPassed(nextTodos)) return { complete: true }
      }

      return { complete: false, feedback: accReport }
    } catch (err) {
      return this.handleBattleError(err, feedback)
    } finally {
      this.activeAgentKeys = []
      this.agent.stop(devKey)
      this.agent.stop(accKey)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private allPassed(todos: TodoItem[]): boolean {
    return todos.length > 0 && todos.every((t) => t.status === 'completed')
  }

  private handleBattleError(err: unknown, fallbackFeedback: string): BattleResult {
    const msg = err instanceof Error ? err.message : String(err)
    if (isRateLimitError(msg)) {
      const resetAt = parseResetTime(msg)
      log.warn('rate limit detected', { resetAt })
      this.projectRepo.patch(this.projectId, { status: 'rate_limited', rateLimitResetAt: resetAt })
      this.broadcastStatus()
      this.notifier.notifyRateLimited(resetAt)
      this.onRateLimit(resetAt)
      return { complete: false, rateLimited: true, resetAt }
    }
    log.warn('battle error, moving to next iteration', { error: msg })
    const errorFeedback = `[Previous iteration ended with an error: ${msg}]${fallbackFeedback ? `\n\n${fallbackFeedback}` : ''}`
    return { complete: false, feedback: errorFeedback }
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

  private completeMilestone(milestone: Milestone, round: number): void {
    log.info('milestone completed!', { milestone: milestone.id })
    const m = this.milestoneRepo.getById(milestone.id)
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
