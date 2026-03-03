import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import type { ConversationAgent } from '../services/types'
import type { ProjectRepository } from '../repositories/ProjectRepository'
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
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  gitService: GitService
  conversationAgent: ConversationAgent
}

// ── Per-project scheduler ─────────────────────────────────────────────────────

export class ProjectScheduler {
  private projectId: string
  private projectPath: string
  private notifier: Notifier
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private gitService: GitService
  private conversationAgent: ConversationAgent
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private activeExecutor: MilestoneExecutor | null = null

  constructor(options: SchedulerOptions) {
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.projectRepo = options.projectRepo
    this.milestoneRepo = options.milestoneRepo
    this.gitService = options.gitService
    this.conversationAgent = options.conversationAgent
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
    // Don't null activeExecutor here — let executeWithExecutor's await handle cleanup
    // to avoid race with executor's onComplete callback
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
      // Don't null activeExecutor — let executeWithExecutor's await handle cleanup
    }

    // Update milestone status
    this.milestoneRepo.save(this.projectId, { ...milestone, status: 'cancelled' })

    // Reset project state
    this.projectRepo.patch(this.projectId, { status: 'sleeping', currentIteration: null })
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
    const project = this.projectRepo.getById(this.projectId)
    const s = schedule ?? project?.wakeSchedule ?? { mode: 'manual', intervalMinutes: null, times: [] }
    const wake = calculateNextWake(s)
    if (!wake) return

    this.projectRepo.patch(this.projectId, { nextWakeTime: wake.nextWakeTime })
    this.broadcastStatus()
    this.scheduleCheck(wake.delayMs)
  }

  // ── Recovery ──────────────────────────────────────────────────────────────

  private async recoverIfNeeded(): Promise<void> {
    const project = this.projectRepo.getById(this.projectId)
    if (!project) return
    if ((project.status !== 'awake' && project.status !== 'paused') || !project.currentIteration) return

    log.info('restart recovery: resuming iteration', { milestone: project.currentIteration.milestoneId })
    const m = this.milestoneRepo.getById(project.currentIteration.milestoneId)
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

    const project = this.projectRepo.getById(this.projectId)
    if (!project) return

    if (project.status === 'rate_limited' && project.rateLimitResetAt) {
      const resetMs = new Date(project.rateLimitResetAt).getTime() - Date.now()
      if (resetMs > 0) {
        this.scheduleCheck(resetMs)
        return
      }
    }

    if (project.status === 'awake' || project.status === 'paused') return

    this.projectRepo.patch(this.projectId, { status: 'checking' })
    this.broadcastStatus()
    log.info('checking for ready milestones', { project: this.projectId })

    const milestones = this.milestoneRepo.getByProjectId(this.projectId)
    const ready = milestones.filter((m) => m.status === 'ready')

    if (ready.length === 0) {
      this.projectRepo.patch(this.projectId, { status: 'sleeping' })
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
      this.projectRepo.patch(this.projectId, { status: 'paused' })
      this.broadcastStatus()
    }
  }

  // ── Executor delegation ───────────────────────────────────────────────────

  private async executeWithExecutor(milestone: Milestone): Promise<void> {
    const executor = new MilestoneExecutor({
      projectId: this.projectId,
      projectPath: this.projectPath,
      notifier: this.notifier,
      projectRepo: this.projectRepo,
      milestoneRepo: this.milestoneRepo,
      gitService: this.gitService,
      conversationAgent: this.conversationAgent,
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
    const project = this.projectRepo.getById(this.projectId)
    if (project) this.notifier.broadcastStatus(project)
  }
}
