import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import type { ProjectStateRepository } from '../repositories/ProjectStateRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { GitService } from '../services/GitService'
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
  stateRepo: ProjectStateRepository
  milestoneRepo: MilestoneRepository
  gitService: GitService
}

// ── Per-project scheduler ─────────────────────────────────────────────────────

export class ProjectScheduler {
  private projectId: string
  private projectPath: string
  private notifier: Notifier
  private stateRepo: ProjectStateRepository
  private milestoneRepo: MilestoneRepository
  private gitService: GitService
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private activeExecutor: MilestoneExecutor | null = null

  constructor(options: SchedulerOptions) {
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.stateRepo = options.stateRepo
    this.milestoneRepo = options.milestoneRepo
    this.gitService = options.gitService
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
    const milestone = this.milestoneRepo.getById(milestoneId)
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
    this.milestoneRepo.save(this.projectId, { ...milestone, status: 'cancelled' })

    // Reset project state
    this.stateRepo.patch(this.projectId, { status: 'sleeping', currentIteration: null })
    this.broadcastStatus()
    this.notifier.broadcastMilestoneUpdate({ ...milestone, status: 'cancelled' })
    log.info('milestone cancelled', { milestone: milestoneId })
  }

  updateSchedule(schedule: WakeSchedule): void {
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
    const s = schedule ?? this.stateRepo.get(this.projectId).wakeSchedule
    const wake = calculateNextWake(s)
    if (!wake) return

    this.stateRepo.patch(this.projectId, { nextWakeTime: wake.nextWakeTime })
    this.broadcastStatus()
    this.scheduleCheck(wake.delayMs)
  }

  // ── Recovery ──────────────────────────────────────────────────────────────

  private async recoverIfNeeded(): Promise<void> {
    const state = this.stateRepo.get(this.projectId)
    if ((state.status !== 'awake' && state.status !== 'paused') || !state.currentIteration) return

    log.info('restart recovery: resuming iteration', { milestone: state.currentIteration.milestoneId })
    const m = this.milestoneRepo.getById(state.currentIteration.milestoneId)
    if (!m) return

    try {
      const branch = `milestone/${m.id}`
      const current = await this.gitService.getCurrentBranch(this.projectPath)
      if (current !== branch) await this.gitService.checkoutBranch(this.projectPath, branch)
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

    const state = this.stateRepo.get(this.projectId)

    if (state.status === 'rate_limited' && state.rateLimitResetAt) {
      const resetMs = new Date(state.rateLimitResetAt).getTime() - Date.now()
      if (resetMs > 0) {
        this.scheduleCheck(resetMs)
        return
      }
    }

    if (state.status === 'awake' || state.status === 'paused') return

    this.stateRepo.patch(this.projectId, { status: 'checking' })
    this.broadcastStatus()
    log.info('checking for ready milestones', { project: this.projectId })

    const milestones = this.milestoneRepo.getByProjectId(this.projectId)
    const ready = milestones.filter((m) => m.status === 'ready')

    if (ready.length === 0) {
      this.stateRepo.patch(this.projectId, { status: 'sleeping' })
      this.broadcastStatus()
      log.info('no ready milestones, going back to sleep', { project: this.projectId })
      this.scheduleNextWake()
      return
    }

    const milestone = ready[0]
    log.info('found ready milestone, starting execution', { milestone: milestone.id })

    try {
      const baseCommit = await this.gitService.createMilestoneBranch(this.projectPath, milestone.id)
      const updated: Milestone = {
        ...milestone,
        status: 'in-progress',
        baseCommit,
        iterationCount: milestone.iterationCount ?? 0,
      }
      this.milestoneRepo.save(this.projectId, updated)
      await this.executeWithExecutor(updated)
    } catch (err) {
      log.error('execution error', { error: String(err) })
      this.stateRepo.patch(this.projectId, { status: 'paused' })
      this.broadcastStatus()
    }
  }

  // ── Executor delegation ───────────────────────────────────────────────────

  private async executeWithExecutor(milestone: Milestone): Promise<void> {
    const executor = new MilestoneExecutor({
      projectId: this.projectId,
      projectPath: this.projectPath,
      notifier: this.notifier,
      stateRepo: this.stateRepo,
      milestoneRepo: this.milestoneRepo,
      gitService: this.gitService,
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
    const state = this.stateRepo.get(this.projectId)
    this.notifier.broadcastStatus(state)
  }
}
