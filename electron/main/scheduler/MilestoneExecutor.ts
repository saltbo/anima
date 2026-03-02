import { createLogger } from '../logger'
import { getMilestones, saveMilestone } from '../data/milestones'
import { getProjectState, patchProjectState } from '../data/state'
import { getCommitLog, hasUncommittedChanges } from '../data/git'
import { conversationAgent } from '../agents/service'
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
  private onRateLimit: (resetAt: string) => void
  private onComplete: () => void
  private aborted = false
  private activeAgentKeys: string[] = []
  /** Snapshot of session IDs captured from agent system events — survives state wipes */
  private capturedSessionIds: { developerSessionId?: string; acceptorSessionId?: string } = {}

  constructor(options: ExecutorOptions) {
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.notifier = options.notifier
    this.onRateLimit = options.onRateLimit
    this.onComplete = options.onComplete
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async execute(milestone: Milestone): Promise<ExecutorResult> {
    let feedback = ''

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (this.aborted) return { outcome: 'aborted' }

      const round = milestone.iterations.length + 1

      if (round > MAX_ITERATIONS) {
        this.handleMaxIterations(milestone, round)
        return { outcome: 'max_iterations' }
      }

      const startedAt = new Date().toISOString()
      this.updateIterationState(milestone.id, round, startedAt)
      log.info('starting iteration', { milestone: milestone.id, round })

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

      // Iteration rejected — developer didn't pass acceptance
      const outcome: IterationOutcome = this.aborted ? 'cancelled' : 'rejected'
      this.recordIteration(milestone.id, round, outcome, startedAt)

      feedback = result.feedback
      milestone = getMilestones(this.projectPath).find((m) => m.id === milestone.id) ?? milestone
    }

    const finalRound = milestone.iterations.length
    this.handleMaxIterations(milestone, finalRound)
    return { outcome: 'max_iterations' }
  }

  abort(): void {
    this.aborted = true
    // Immediately stop any running agent sessions
    for (const key of this.activeAgentKeys) {
      conversationAgent.stop(key)
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

    try {
      // 1. Developer works
      const branch = `milestone/${milestone.id}`
      const commitLog = await getCommitLog(this.projectPath, branch)
      const uncommitted = await hasUncommittedChanges(this.projectPath)

      const devReport = await conversationAgent.run(devKey, {
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
            const cur = getProjectState(this.projectPath).currentIteration
            if (cur) patchProjectState(this.projectPath, { currentIteration: { ...cur, developerSessionId: event.sessionId } })
          }
          if (event.event === 'tool_use' && event.toolName === 'TodoWrite') {
            const todos = parseTodoWrite(event.toolInput)
            const updated = captureDeveloperTodos(milestone, todos, iteration)
            if (updated) {
              saveMilestone(this.projectPath, updated)
              this.notifier.broadcastMilestoneUpdate(updated)
            }
          }
        },
      })

      // Refresh milestone after developer phase
      milestone = getMilestones(this.projectPath).find((m) => m.id === milestone.id) ?? milestone

      // 2. Acceptor reviews
      const roundTodos: TodoItem[] = []
      const onAccEvent = (event: AgentEvent, todos: TodoItem[]): void => {
        if (event.event === 'system') {
          log.info('acceptor system event', { sessionId: event.sessionId, accKey })
          this.notifier.broadcastAgentEvent('acceptor', accKey)
          this.capturedSessionIds.acceptorSessionId = event.sessionId
          const cur = getProjectState(this.projectPath).currentIteration
          if (cur) patchProjectState(this.projectPath, { currentIteration: { ...cur, acceptorSessionId: event.sessionId } })
        }
        if (event.event === 'tool_use' && event.toolName === 'TodoWrite') {
          const parsed = parseTodoWrite(event.toolInput)
          todos.splice(0, todos.length, ...parsed)
          const updated = captureAcceptorTodos(milestone, parsed, iteration)
          if (updated) {
            saveMilestone(this.projectPath, updated)
            this.notifier.broadcastMilestoneUpdate(updated)
          }
        }
      }

      let accReport = await conversationAgent.run(accKey, {
        projectPath: this.projectPath,
        systemPrompt: buildAcceptorSystemPrompt(),
        firstMessage: buildAcceptorMessage(milestone, devReport, iteration, this.projectPath),
        onEvent: (e) => onAccEvent(e, roundTodos),
      })

      if (this.allPassed(roundTodos)) return { complete: true }

      // 3. Relay loop — two agents talk through the bridge
      for (let round = 2; round <= MAX_ROUNDS_PER_ITERATION; round++) {
        if (this.aborted) return { complete: false, feedback: accReport }

        const fixReport = await conversationAgent.continue(devKey, buildDeveloperFixMessage(accReport))

        const nextTodos: TodoItem[] = []
        accReport = await conversationAgent.continue(
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
      conversationAgent.stop(devKey)
      conversationAgent.stop(accKey)
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
      patchProjectState(this.projectPath, { status: 'rate_limited', rateLimitResetAt: resetAt })
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
    const m = getMilestones(this.projectPath).find((ms) => ms.id === milestone.id)
    if (m) {
      m.iterationCount = round
      saveMilestone(this.projectPath, m)
    }
    const cur = getProjectState(this.projectPath).currentIteration
    patchProjectState(this.projectPath, {
      status: 'paused',
      currentIteration: cur ?? { milestoneId: milestone.id, round },
    })
    this.broadcastStatus()
    this.notifier.notifyIterationPaused(milestone.id, 'max_iterations')
  }

  private completeMilestone(milestone: Milestone, round: number): void {
    log.info('milestone completed!', { milestone: milestone.id })
    const m = getMilestones(this.projectPath).find((ms) => ms.id === milestone.id)
    if (m) {
      m.status = 'completed'
      m.completedAt = new Date().toISOString()
      m.iterationCount = round
      saveMilestone(this.projectPath, m)
    }
    patchProjectState(this.projectPath, { status: 'sleeping', currentIteration: null })
    this.broadcastStatus()
    this.notifier.notifyMilestoneCompleted(milestone.id)
    this.onComplete()
  }

  private updateIterationState(milestoneId: string, round: number, startedAt: string): void {
    const iter: Iteration = { milestoneId, round, startedAt }
    patchProjectState(this.projectPath, { status: 'awake', currentIteration: iter })
    this.broadcastStatus()
  }

  private recordIteration(milestoneId: string, round: number, outcome: IterationOutcome, startedAt: string): void {
    log.info('recordIteration', {
      milestoneId,
      round,
      outcome,
      devSessionId: this.capturedSessionIds.developerSessionId ?? 'NONE',
      accSessionId: this.capturedSessionIds.acceptorSessionId ?? 'NONE',
    })
    const record: Iteration = {
      milestoneId,
      round,
      developerSessionId: this.capturedSessionIds.developerSessionId,
      acceptorSessionId: this.capturedSessionIds.acceptorSessionId,
      outcome,
      startedAt,
      completedAt: new Date().toISOString(),
    }
    const m = getMilestones(this.projectPath).find((ms) => ms.id === milestoneId)
    if (!m) {
      log.warn('recordIteration: milestone not found, skipping', { milestoneId })
      return
    }
    m.iterations.push(record)
    saveMilestone(this.projectPath, m)
    this.notifier.broadcastMilestoneUpdate(m)
  }

  private broadcastStatus(): void {
    const state = getProjectState(this.projectPath)
    this.notifier.broadcastStatus(state)
  }
}
