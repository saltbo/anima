import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import { getMilestones, saveMilestone } from '../data/milestones'
import { getProjectState, patchProjectState } from '../data/state'
import { createMilestoneBranch, getCurrentBranch, checkoutBranch, getCommitLog, hasUncommittedChanges } from '../data/git'
import { conversationAgent } from '../agents/service'
import type { Milestone, WakeSchedule, Iteration } from '../../../src/types/index'
import type { ProjectAgentEvent, ProjectIterationStatus } from '../../../src/types/electron.d'

const log = createLogger('scheduler')

const MAX_ITERATIONS = 20
const MAX_ROUNDS_PER_ITERATION = 5
const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000 // 60 minutes

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildDeveloperSystemPrompt(): string {
  return (
    'You are an expert software developer. ' +
    'You implement features precisely as specified in the milestone definition. ' +
    'Use TodoWrite to plan your work before implementing. ' +
    'Commit your changes with conventional commit messages. ' +
    'When done, output a concise implementation report listing what was done and the commit hash(es).'
  )
}

function buildAcceptorSystemPrompt(): string {
  return (
    'You are a strict code reviewer and quality acceptor. ' +
    'You verify that implementations meet the stated acceptance criteria. ' +
    'Use TodoWrite to create one todo per acceptance criterion you are checking. ' +
    'Mark todos as completed only when the criterion is fully met. ' +
    'At the end of your review, explicitly state: ' +
    '"MILESTONE_COMPLETE" if all requirements are satisfied, or ' +
    '"MILESTONE_INCOMPLETE: <unmet items>" if requirements remain.'
  )
}

async function buildDeveloperFirstMessage(
  projectPath: string,
  milestone: Milestone,
  iterationCount: number,
  remainingFeedback: string
): Promise<string> {
  const branch = `milestone/${milestone.id}`
  const commitLog = await getCommitLog(projectPath, branch)
  const uncommitted = await hasUncommittedChanges(projectPath)

  const sections: string[] = [
    `## Your Context`,
    `- Current branch: ${branch}`,
    `- Iteration: ${iterationCount}`,
    ``,
    `## Project Files to Read First`,
    `- ./VISION.md`,
    `- ./.anima/soul.md`,
    `- ./.anima/milestones/${milestone.id}.md`,
    `- ./.anima/memory/project.md (if exists)`,
    ``,
    `## Milestone: ${milestone.title}`,
    milestone.description,
    ``,
    `## Previous Work (git log)`,
    commitLog || '(no commits yet)',
  ]

  if (uncommitted) {
    sections.push(``, `## Note`, `There are uncommitted changes from the previous iteration. Review and handle them.`)
  }

  if (remainingFeedback) {
    sections.push(``, `## Acceptor Feedback from Previous Round`, remainingFeedback)
  }

  sections.push(
    ``,
    `## Your Task`,
    `1. Read the milestone file and analyze what remains to be done`,
    `2. Use TodoWrite to create your implementation plan for this iteration`,
    `3. Implement the planned features`,
    `4. Commit with conventional commit format to branch ${branch}`,
    `5. Send an implementation report: what was done + commit hash(es)`
  )

  return sections.join('\n')
}

function buildAcceptorMessage(
  milestone: Milestone,
  developerReport: string,
  iterationCount: number
): string {
  const sections: string[] = [
    `## Your Context`,
    `- Milestone: ${milestone.title}`,
    `- Iteration: ${iterationCount}`,
    ``,
    `## Files to Review`,
    `- ./.anima/soul.md (coding standards)`,
    `- ./.anima/milestones/${milestone.id}.md (acceptance criteria)`,
    ``,
    `## Developer's Implementation Report`,
    developerReport,
    ``,
    `## Your Task`,
    `1. Use TodoWrite to create one todo per acceptance criterion`,
    `2. Use git show / git diff to verify actual code changes`,
    `3. Update each todo: completed = passed, pending = not yet met`,
    `4. List specific issues for any failing criteria`,
    `5. End your response with either:`,
    `   - "MILESTONE_COMPLETE" (all criteria met, no more work needed)`,
    `   - "MILESTONE_INCOMPLETE: <list unmet items>" (more work needed)`,
  ]
  return sections.join('\n')
}

function buildDeveloperFixMessage(acceptorFeedback: string): string {
  return (
    `## Acceptor Feedback\n\n${acceptorFeedback}\n\n` +
    `## Your Task\n` +
    `Fix the issues listed above. ` +
    `Commit your changes and send a new implementation report.`
  )
}

// ── TodoWrite parser ──────────────────────────────────────────────────────────

interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

function parseTodoWrite(toolInput: string): TodoItem[] {
  try {
    const parsed = JSON.parse(toolInput) as { todos?: TodoItem[] }
    return parsed.todos ?? []
  } catch {
    return []
  }
}

// ── Per-project scheduler ─────────────────────────────────────────────────────

export interface SchedulerOptions {
  projectId: string
  projectPath: string
  getWindow: () => BrowserWindow | null
}

export class ProjectScheduler {
  private projectId: string
  private projectPath: string
  private getWindow: () => BrowserWindow | null
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(options: SchedulerOptions) {
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.getWindow = options.getWindow
  }

  start(): void {
    this.running = true
    log.info('scheduler started', { project: this.projectId })
    // Immediate check on start
    this.scheduleCheck(0)
    // Also handle restart recovery
    this.recoverIfNeeded()
  }

  stop(): void {
    this.running = false
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer)
      this.wakeTimer = null
    }
    log.info('scheduler stopped', { project: this.projectId })
  }

  wakeNow(): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.scheduleCheck(0)
  }

  updateSchedule(schedule: WakeSchedule): void {
    patchProjectState(this.projectPath, { wakeSchedule: schedule })
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.scheduleNextWake(schedule)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private scheduleCheck(delayMs: number): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null
      this.check().catch((err) => log.error('check error', { error: String(err) }))
    }, delayMs)
  }

  private scheduleNextWake(schedule?: WakeSchedule): void {
    if (!this.running) return
    const s = schedule ?? getProjectState(this.projectPath).wakeSchedule
    if (s.mode === 'manual') return

    if (s.mode === 'interval' && s.intervalMinutes) {
      const ms = s.intervalMinutes * 60 * 1000
      const nextWakeTime = new Date(Date.now() + ms).toISOString()
      patchProjectState(this.projectPath, { nextWakeTime })
      this.broadcastStatus()
      this.scheduleCheck(ms)
      return
    }

    if (s.mode === 'times' && s.times.length > 0) {
      const now = new Date()
      let minDiff = Infinity
      for (const t of s.times) {
        const [h, m] = t.split(':').map(Number)
        const next = new Date(now)
        next.setHours(h, m, 0, 0)
        if (next <= now) next.setDate(next.getDate() + 1)
        const diff = next.getTime() - now.getTime()
        if (diff < minDiff) minDiff = diff
      }
      if (minDiff < Infinity) {
        const nextWakeTime = new Date(Date.now() + minDiff).toISOString()
        patchProjectState(this.projectPath, { nextWakeTime })
        this.broadcastStatus()
        this.scheduleCheck(minDiff)
      }
    }
  }

  private async recoverIfNeeded(): Promise<void> {
    const state = getProjectState(this.projectPath)
    if (state.status === 'awake' && state.currentIteration) {
      log.info('restart recovery: resuming iteration', { milestone: state.currentIteration.milestoneId })
      const milestones = getMilestones(this.projectPath)
      const m = milestones.find((ms) => ms.id === state.currentIteration?.milestoneId)
      if (m) {
        // Ensure we're on the right branch
        try {
          const branch = `milestone/${m.id}`
          const current = await getCurrentBranch(this.projectPath)
          if (current !== branch) {
            await checkoutBranch(this.projectPath, branch)
          }
        } catch (err) {
          log.warn('branch switch failed on recovery', { error: String(err) })
        }
        this.runIterationLoop(m, {
          developerSessionId: state.currentIteration.developerSessionId,
          acceptorSessionId: state.currentIteration.acceptorSessionId,
        }).catch((err) =>
          log.error('iteration loop error', { error: String(err) })
        )
      }
    }
  }

  private async check(): Promise<void> {
    if (!this.running) return

    const state = getProjectState(this.projectPath)

    // Handle rate_limited: if reset time hasn't arrived, reschedule
    if (state.status === 'rate_limited' && state.rateLimitResetAt) {
      const resetMs = new Date(state.rateLimitResetAt).getTime() - Date.now()
      if (resetMs > 0) {
        this.scheduleCheck(resetMs)
        return
      }
    }

    // Don't interrupt an active iteration
    if (state.status === 'awake') return

    patchProjectState(this.projectPath, { status: 'checking' })
    this.broadcastStatus()
    log.info('checking for ready milestones', { project: this.projectId })

    const milestones = getMilestones(this.projectPath)
    const ready = milestones.filter((m) => m.status === 'ready')

    if (ready.length === 0) {
      patchProjectState(this.projectPath, { status: 'sleeping' })
      this.broadcastStatus()
      log.info('no ready milestones, going back to sleep', { project: this.projectId })
      this.scheduleNextWake()
      return
    }

    const milestone = ready[0]
    log.info('found ready milestone, starting iteration', { milestone: milestone.id })

    try {
      // Create/checkout milestone branch
      const baseCommit = await createMilestoneBranch(this.projectPath, milestone.id)
      const updated: Milestone = {
        ...milestone,
        status: 'in-progress',
        baseCommit,
        iterationCount: milestone.iterationCount ?? 0,
      }
      saveMilestone(this.projectPath, updated)
      const iter: Iteration = { milestoneId: milestone.id, count: 0 }
      patchProjectState(this.projectPath, {
        status: 'awake',
        currentIteration: iter,
      })
      this.broadcastStatus()

      await this.runIterationLoop(updated, {})
    } catch (err) {
      log.error('iteration error', { error: String(err) })
      patchProjectState(this.projectPath, { status: 'sleeping', currentIteration: null })
      this.broadcastStatus()
      this.scheduleNextWake()
    }
  }

  private async runIterationLoop(
    milestone: Milestone,
    resumeSessions: { developerSessionId?: string; acceptorSessionId?: string },
    initialFeedback = ''
  ): Promise<void> {
    let remainingFeedback = initialFeedback
    let isFirstRun = true

    while (this.running) {
      const state = getProjectState(this.projectPath)
      const iterationCount = (state.currentIteration?.count ?? 0) + 1

      if (iterationCount > MAX_ITERATIONS) {
        log.warn('max iterations reached', { milestone: milestone.id })
        const pausedMs = getMilestones(this.projectPath)
        const pausedM = pausedMs.find((ms) => ms.id === milestone.id)
        if (pausedM) {
          pausedM.iterationCount = iterationCount
          saveMilestone(this.projectPath, pausedM)
        }
        patchProjectState(this.projectPath, { status: 'paused', currentIteration: { milestoneId: milestone.id, count: iterationCount } })
        this.broadcastStatus()
        this.notifyUI('project:iterationPaused', { projectId: this.projectId, milestoneId: milestone.id, reason: 'max_iterations' })
        return
      }

      const iter: Iteration = { milestoneId: milestone.id, count: iterationCount }
      patchProjectState(this.projectPath, { currentIteration: iter })
      this.broadcastStatus()
      log.info('starting iteration', { milestone: milestone.id, iteration: iterationCount })

      const devAgentKey = `${milestone.id}-dev-${iterationCount}`
      const accAgentKey = `${milestone.id}-acc-${iterationCount}`

      // On recovery (first run), pass stored session IDs for Claude --resume
      const devResumeSessionId = isFirstRun ? resumeSessions.developerSessionId : undefined
      const accResumeSessionId = isFirstRun ? resumeSessions.acceptorSessionId : undefined
      isFirstRun = false

      // ── Developer phase ─────────────────────────────────────────────────

      const devFirstMsg = await buildDeveloperFirstMessage(
        this.projectPath,
        milestone,
        iterationCount,
        remainingFeedback
      )

      let developerReport = ''
      const devTodos: TodoItem[] = []

      try {
        developerReport = await conversationAgent.run(devAgentKey, {
          projectPath: this.projectPath,
          systemPrompt: buildDeveloperSystemPrompt(),
          sessionId: devResumeSessionId,
          firstMessage: devFirstMsg,
          onEvent: (event) => {
            if (event.event === 'system') {
              this.broadcastAgentEvent('developer', devAgentKey)
              const cur = getProjectState(this.projectPath).currentIteration
              if (cur) patchProjectState(this.projectPath, { currentIteration: { ...cur, developerSessionId: event.sessionId } })
            }
            if (event.event === 'tool_use' && event.toolName === 'TodoWrite') {
              const todos = parseTodoWrite(event.toolInput)
              this.captureTodosAsTasks(milestone, iterationCount, todos, devTodos)
            }
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (this.handleRateLimitError(msg)) return
        log.warn('developer session error/timeout', { error: msg })
        continue
      }

      // Reload milestone to pick up any state changes
      milestone = getMilestones(this.projectPath).find((m) => m.id === milestone.id) ?? milestone

      // ── Battle phase ────────────────────────────────────────────────────

      let round = 0
      let milestoneComplete = false
      remainingFeedback = ''

      while (round < MAX_ROUNDS_PER_ITERATION && this.running) {
        round++
        log.info('battle round', { milestone: milestone.id, iteration: iterationCount, round })
        this.broadcastStatus()

        const accMsg = buildAcceptorMessage(milestone, developerReport, iterationCount)
        const accTodos: TodoItem[] = []

        let acceptorReport = ''
        try {
          acceptorReport = await conversationAgent.run(accAgentKey, {
            projectPath: this.projectPath,
            systemPrompt: buildAcceptorSystemPrompt(),
            sessionId: accResumeSessionId,
            firstMessage: accMsg,
            onEvent: (event) => {
              if (event.event === 'system') {
                this.broadcastAgentEvent('acceptor', accAgentKey)
                const cur = getProjectState(this.projectPath).currentIteration
                if (cur) patchProjectState(this.projectPath, { currentIteration: { ...cur, acceptorSessionId: event.sessionId } })
              }
              if (event.event === 'tool_use' && event.toolName === 'TodoWrite') {
                const todos = parseTodoWrite(event.toolInput)
                this.captureTodosAsAC(milestone, iterationCount, todos, accTodos)
              }
            },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (this.handleRateLimitError(msg)) return
          log.warn('acceptor session error/timeout', { error: msg })
          break
        }

        milestone = getMilestones(this.projectPath).find((m) => m.id === milestone.id) ?? milestone

        // Milestone complete when all acceptor todos are marked done.
        const allAccPassed = accTodos.length > 0 && accTodos.every((t) => t.status === 'completed')
        if (allAccPassed) {
          milestoneComplete = true
          break
        }

        const feedback = acceptorReport

        if (round >= MAX_ROUNDS_PER_ITERATION) {
          remainingFeedback = feedback
          break
        }

        // Send feedback to developer in same session and get new report
        try {
          developerReport = await conversationAgent.continue(devAgentKey, buildDeveloperFixMessage(feedback))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (this.handleRateLimitError(msg)) return
          log.warn('developer fix session error', { error: msg })
          remainingFeedback = feedback
          break
        }
      }

      // Close sessions
      conversationAgent.stop(devAgentKey)
      conversationAgent.stop(accAgentKey)

      if (milestoneComplete) {
        log.info('milestone completed!', { milestone: milestone.id })
        const milestones = getMilestones(this.projectPath)
        const m = milestones.find((ms) => ms.id === milestone.id)
        if (m) {
          m.status = 'completed'
          m.completedAt = new Date().toISOString()
          m.iterationCount = iterationCount
          saveMilestone(this.projectPath, m)
        }
        patchProjectState(this.projectPath, {
          status: 'sleeping',
          currentIteration: null,
        })
        this.broadcastStatus()
        this.notifyUI('milestones:completed', { projectId: this.projectId, milestoneId: milestone.id })
        this.scheduleNextWake()
        return
      }
    }
  }

  private handleRateLimitError(message: string): boolean {
    const rateLimitPatterns = [
      /rate.?limit/i,
      /quota/i,
      /too many requests/i,
      /429/,
    ]
    if (!rateLimitPatterns.some((p) => p.test(message))) return false

    // Try to parse reset time from message
    let resetAt: string
    const timeMatch = message.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/)
    if (timeMatch) {
      resetAt = timeMatch[1]
    } else {
      resetAt = new Date(Date.now() + RATE_LIMIT_FALLBACK_MS).toISOString()
    }

    log.warn('rate limit detected', { resetAt })
    patchProjectState(this.projectPath, { status: 'rate_limited', rateLimitResetAt: resetAt })
    this.broadcastStatus()
    this.notifyUI('agent:rateLimited', { projectId: this.projectId, resetAt })

    // Schedule recovery
    const msUntilReset = Math.max(0, new Date(resetAt).getTime() - Date.now())
    this.scheduleCheck(msUntilReset)
    return true
  }

  // ── TodoWrite capture ──────────────────────────────────────────────────────

  private captureTodosAsTasks(
    milestone: Milestone,
    iteration: number,
    todos: TodoItem[],
    accumulator: TodoItem[]
  ): void {
    const milestones = getMilestones(this.projectPath)
    const m = milestones.find((ms) => ms.id === milestone.id)
    if (!m) return

    let changed = false
    for (const todo of todos) {
      accumulator.push(todo)
      const existing = m.tasks.find((t) => t.id === todo.id)
      if (existing) {
        existing.completed = todo.status === 'completed'
        changed = true
      } else {
        m.tasks.push({
          id: todo.id || randomUUID(),
          title: todo.content,
          completed: todo.status === 'completed',
          order: m.tasks.length,
          iteration,
        })
        changed = true
      }
    }
    if (changed) {
      saveMilestone(this.projectPath, m)
      this.broadcastMilestoneUpdate(m)
    }
  }

  private captureTodosAsAC(
    milestone: Milestone,
    iteration: number,
    todos: TodoItem[],
    accumulator: TodoItem[]
  ): void {
    const milestones = getMilestones(this.projectPath)
    const m = milestones.find((ms) => ms.id === milestone.id)
    if (!m) return

    let changed = false
    for (const todo of todos) {
      accumulator.push(todo)
      const existing = m.acceptanceCriteria.find((ac) => ac.title === todo.content && ac.iteration === iteration)
      if (existing) {
        existing.status = todo.status === 'completed' ? 'passed' : 'pending'
        changed = true
      } else {
        m.acceptanceCriteria.push({
          title: todo.content,
          status: todo.status === 'completed' ? 'passed' : todo.status === 'pending' ? 'pending' : 'rejected',
          iteration,
        })
        changed = true
      }
    }
    if (changed) {
      saveMilestone(this.projectPath, m)
      this.broadcastMilestoneUpdate(m)
    }
  }

  // ── UI notifications ───────────────────────────────────────────────────────

  private broadcastStatus(): void {
    const win = this.getWindow()
    if (!win) return
    const state = getProjectState(this.projectPath)
    const status: ProjectIterationStatus = {
      projectId: this.projectId,
      status: state.status,
      currentIteration: state.currentIteration,
      rateLimitResetAt: state.rateLimitResetAt,
    }
    win.webContents.send('project:statusChanged', status)
  }

  private broadcastAgentEvent(role: 'developer' | 'acceptor', agentKey: string): void {
    const win = this.getWindow()
    if (!win) return
    const payload: ProjectAgentEvent = { projectId: this.projectId, role, agentKey }
    win.webContents.send('project:agentEvent', payload)
  }

  private broadcastMilestoneUpdate(milestone: Milestone): void {
    const win = this.getWindow()
    if (!win) return
    win.webContents.send('milestones:updated', { projectId: this.projectId, milestone })
  }

  private notifyUI(channel: string, data: unknown): void {
    const win = this.getWindow()
    if (!win) return
    win.webContents.send(channel, data)
  }
}
