import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import { getMilestones, saveMilestone } from '../data/milestones'
import { getProjectState, patchProjectState } from '../data/state'
import { createMilestoneBranch, getCurrentBranch, checkoutBranch } from '../data/git'
import type { Milestone, WakeSchedule } from '../../../src/types/index'
import { Notifier } from './notifier'
import { calculateNextWake } from './wakeScheduler'
import { MilestoneExecutor } from './MilestoneExecutor'

const log = createLogger('scheduler')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchedulerOptions {
  projectId: string
  projectPath: string
  getWindow: () => BrowserWindow | null
}

// ── Per-project scheduler ─────────────────────────────────────────────────────

export class ProjectScheduler {
  private projectId: string
  private projectPath: string
  private notifier: Notifier
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private activeExecutor: MilestoneExecutor | null = null

  constructor(options: SchedulerOptions) {
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.notifier = new Notifier(options.projectId, options.getWindow)
  }

  start(): void {
    this.running = true
    log.info('scheduler started', { project: this.projectId })
    this.scheduleCheck(0)
    this.recoverIfNeeded()
  }

  stop(): void {
    this.running = false
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer)
      this.wakeTimer = null
    }
    this.activeExecutor?.abort()
    this.activeExecutor = null
    log.info('scheduler stopped', { project: this.projectId })
  }

  wakeNow(): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.scheduleCheck(0)
  }

  cancelMilestone(milestoneId: string): void {
    const milestones = getMilestones(this.projectPath)
    const milestone = milestones.find((m) => m.id === milestoneId)
    if (!milestone) return

    if (milestone.status !== 'ready' && milestone.status !== 'in-progress') {
      log.warn('cannot cancel milestone in status', { status: milestone.status })
      return
    }

    // Abort active executor if in-progress
    if (milestone.status === 'in-progress' && this.activeExecutor) {
      this.activeExecutor.abort()
      this.activeExecutor = null
    }

    // Update milestone status
    saveMilestone(this.projectPath, { ...milestone, status: 'cancelled' })

    // Reset project state
    patchProjectState(this.projectPath, { status: 'sleeping', currentIteration: null })
    this.broadcastStatus()
    this.notifier.broadcastMilestoneUpdate({ ...milestone, status: 'cancelled' })
    log.info('milestone cancelled', { milestone: milestoneId })
  }

  updateSchedule(schedule: WakeSchedule): void {
    patchProjectState(this.projectPath, { wakeSchedule: schedule })
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.scheduleNextWake(schedule)
  }

  // ── Wake scheduling ───────────────────────────────────────────────────────

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
    const wake = calculateNextWake(s)
    if (!wake) return

    patchProjectState(this.projectPath, { nextWakeTime: wake.nextWakeTime })
    this.broadcastStatus()
    this.scheduleCheck(wake.delayMs)
  }

  // ── Recovery ──────────────────────────────────────────────────────────────

  private async recoverIfNeeded(): Promise<void> {
    const state = getProjectState(this.projectPath)
    if ((state.status !== 'awake' && state.status !== 'paused') || !state.currentIteration) return

    log.info('restart recovery: resuming iteration', { milestone: state.currentIteration.milestoneId })
    const milestones = getMilestones(this.projectPath)
    const m = milestones.find((ms) => ms.id === state.currentIteration?.milestoneId)
    if (!m) return

    try {
      const branch = `milestone/${m.id}`
      const current = await getCurrentBranch(this.projectPath)
      if (current !== branch) await checkoutBranch(this.projectPath, branch)
    } catch (err) {
      log.warn('branch switch failed on recovery', { error: String(err) })
    }

    this.executeWithExecutor(m).catch((err) =>
      log.error('executor error during recovery', { error: String(err) })
    )
  }

  // ── Check & dispatch ──────────────────────────────────────────────────────

  private async check(): Promise<void> {
    if (!this.running) return

    const state = getProjectState(this.projectPath)

    if (state.status === 'rate_limited' && state.rateLimitResetAt) {
      const resetMs = new Date(state.rateLimitResetAt).getTime() - Date.now()
      if (resetMs > 0) {
        this.scheduleCheck(resetMs)
        return
      }
    }

    if (state.status === 'awake' || state.status === 'paused') return

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
    log.info('found ready milestone, starting execution', { milestone: milestone.id })

    try {
      const baseCommit = await createMilestoneBranch(this.projectPath, milestone.id)
      const updated: Milestone = {
        ...milestone,
        status: 'in-progress',
        baseCommit,
        iterationCount: milestone.iterationCount ?? 0,
      }
      saveMilestone(this.projectPath, updated)
      patchProjectState(this.projectPath, {
        status: 'awake',
        currentIteration: { milestoneId: milestone.id, count: 0 },
      })
      this.broadcastStatus()

      await this.executeWithExecutor(updated)
    } catch (err) {
      log.error('execution error', { error: String(err) })
      patchProjectState(this.projectPath, { status: 'paused' })
      this.broadcastStatus()
    }
  }

  // ── Executor delegation ───────────────────────────────────────────────────

  private async executeWithExecutor(milestone: Milestone): Promise<void> {
    const executor = new MilestoneExecutor({
      projectId: this.projectId,
      projectPath: this.projectPath,
      notifier: this.notifier,
      onRateLimit: (resetAt) => {
        const msUntilReset = Math.max(0, new Date(resetAt).getTime() - Date.now())
        this.scheduleCheck(msUntilReset)
      },
      onComplete: () => {
        this.scheduleNextWake()
      },
    })
    this.activeExecutor = executor

    const result = await executor.execute(milestone)
    this.activeExecutor = null

    log.info('executor finished', { milestone: milestone.id, outcome: result.outcome })
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private broadcastStatus(): void {
    const state = getProjectState(this.projectPath)
    this.notifier.broadcastStatus(state)
  }
}
