import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import { msUntil } from '../lib/time'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { BacklogRepository } from '../repositories/BacklogRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { WakeSchedule } from '../../../src/types/index'
import type { SoulState, SoulTask, SoulContext, Decision, PendingMention } from './types'
import { think } from './decide'
import { calculateNextWake } from './wakeScheduler'
import { Notifier } from './notifier'
import { parseMentions } from '../agents/mention'

const log = createLogger('soul')

const HEARTBEAT_INTERVAL = 60_000 // 1 minute

// ── Types ────────────────────────────────────────────────────────────────────

export interface SoulOptions {
  projectId: string
  projectPath: string
  getWindow: () => BrowserWindow | null
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  backlogRepo: BacklogRepository
  commentRepo: CommentRepository
}

// ── Soul ─────────────────────────────────────────────────────────────────────

export class Soul {
  private state: SoulState = 'sleeping'
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private pendingTick: ReturnType<typeof setTimeout> | null = null
  private abortController: AbortController | null = null
  private tasks = new Map<string, SoulTask>()
  private wakeRequested = false
  private notifier: Notifier
  private opts: SoulOptions

  constructor(opts: SoulOptions) {
    this.opts = opts
    this.notifier = new Notifier(opts.projectId, opts.getWindow)
  }

  // ── Plugin registration ──────────────────────────────────────────────────

  register(name: string, task: SoulTask): void {
    this.tasks.set(name, task)
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  wake(): void {
    if (this.state === 'busy') {
      // Already working — just mark that we want to re-evaluate after
      this.wakeRequested = true
      return
    }
    this.state = 'idle'
    this.wakeRequested = true
    this.startHeartbeat()
    this.updateProjectStatus()
    log.info('soul woken', { project: this.opts.projectId })
  }

  sleep(): void {
    this.stopHeartbeat()
    if (this.state !== 'busy') {
      this.state = 'sleeping'
      this.updateProjectStatus()
    }
    log.info('soul sleeping', { project: this.opts.projectId })
  }

  abort(): void {
    this.abortController?.abort()
    this.abortController = null
    if (this.state === 'busy') {
      this.state = 'idle'
      this.updateProjectStatus()
    }
    log.info('soul aborted current task', { project: this.opts.projectId })
  }

  destroy(): void {
    this.abort()
    this.stopHeartbeat()
    this.state = 'sleeping'
  }

  updateSchedule(schedule: WakeSchedule): void {
    this.opts.projectRepo.patch(this.opts.projectId, { wakeSchedule: schedule })
    // Re-evaluate schedule
    const wake = calculateNextWake(schedule)
    if (wake) {
      this.opts.projectRepo.patch(this.opts.projectId, { nextWakeTime: wake.nextWakeTime })
    }
    this.broadcastStatus()
  }

  getState(): SoulState {
    return this.state
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeat) return
    this.pendingTick = setTimeout(() => {
      this.pendingTick = null
      this.tick()
    }, 0) // deferred first tick — avoids synchronous side effects from wake()
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.pendingTick) {
      clearTimeout(this.pendingTick)
      this.pendingTick = null
    }
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private tick(): void {
    if (this.state !== 'idle') return // sleeping or busy → skip

    // Wake schedule gate (unless explicitly woken)
    if (!this.wakeRequested && !this.isScheduledWakeTime()) return
    this.wakeRequested = false

    const context = this.sense()
    const decision = think(context)
    this.act(decision).catch((err) => {
      log.error('act() error', { project: this.opts.projectId, error: String(err) })
    })
  }

  // ── Sense / Think / Act ──────────────────────────────────────────────────

  private sense(): SoulContext {
    const milestones = this.opts.milestoneRepo.getByProjectId(this.opts.projectId)

    // Collect undispatched mentions from in-progress milestones
    const pendingMentions: PendingMention[] = []
    for (const m of milestones) {
      if (m.status !== 'in_progress') continue
      const comments = this.opts.commentRepo.getUndispatchedMentions(m.id)
      for (const comment of comments) {
        const mentions = parseMentions(comment.body)
        for (const agentId of mentions) {
          pendingMentions.push({ agentId, milestoneId: m.id, commentId: comment.id })
        }
      }
    }

    return {
      project: this.opts.projectRepo.getById(this.opts.projectId) ?? null,
      milestones,
      backlogItems: this.opts.backlogRepo.getByProjectId(this.opts.projectId),
      pendingMentions,
    }
  }

  private async act(decision: Decision): Promise<void> {
    if (decision.task === 'idle') return

    const task = this.tasks.get(decision.task)
    if (!task) {
      log.warn('no registered task handler', { task: decision.task })
      return
    }

    this.state = 'busy'
    this.updateProjectStatus()
    this.abortController = new AbortController()

    try {
      await task.execute(decision, this.abortController.signal)
    } catch (err) {
      log.error('task error', { task: decision.task, error: String(err) })
    } finally {
      this.abortController = null
      if (this.state === 'busy') {
        this.state = 'idle'
        this.updateProjectStatus()
      }
      // Schedule next wake after task completion
      this.scheduleNextWake()
    }
  }

  // ── Scheduling ───────────────────────────────────────────────────────────

  private isScheduledWakeTime(): boolean {
    const project = this.opts.projectRepo.getById(this.opts.projectId)
    if (!project?.nextWakeTime) return false
    return msUntil(project.nextWakeTime) <= 0
  }

  private scheduleNextWake(): void {
    const project = this.opts.projectRepo.getById(this.opts.projectId)
    if (!project) return
    const wake = calculateNextWake(project.wakeSchedule)
    if (wake) {
      this.opts.projectRepo.patch(this.opts.projectId, { nextWakeTime: wake.nextWakeTime })
      this.broadcastStatus()
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private updateProjectStatus(): void {
    const statusMap: Record<SoulState, string> = {
      sleeping: 'sleeping',
      idle: 'idle',
      busy: 'busy',
    }
    // Only update if the project isn't in a special state (paused, rate_limited)
    const project = this.opts.projectRepo.getById(this.opts.projectId)
    if (!project) return
    if (project.status === 'paused' || project.status === 'rate_limited') return
    this.opts.projectRepo.patch(this.opts.projectId, { status: statusMap[this.state] })
    this.broadcastStatus()
  }

  private broadcastStatus(): void {
    const project = this.opts.projectRepo.getById(this.opts.projectId)
    if (project) this.notifier.broadcastStatus(project)
  }
}
