import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import type { Project, WakeSchedule, MilestoneGitInfo, TransitionPayload } from '../../../src/types/index'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { BacklogRepository } from '../repositories/BacklogRepository'
import type { MilestoneItemRepository } from '../repositories/MilestoneItemRepository'
import type { GitService } from './GitService'
import { MilestoneLifecycle } from './MilestoneLifecycle'
import { Soul } from '../soul/Soul'
import { AgentDispatchTask } from '../soul/tasks/AgentDispatchTask'
import { Notifier } from '../soul/notifier'
import type { AgentRunner } from '../agents/AgentRunner'

const log = createLogger('soul-service')

export class SoulService {
  private souls = new Map<string, Soul>()
  private lifecycle: MilestoneLifecycle | null = null

  constructor(
    private projectRepo: ProjectRepository,
    private milestoneRepo: MilestoneRepository,
    private commentRepo: CommentRepository,
    private backlogRepo: BacklogRepository,
    private milestoneItemRepo: MilestoneItemRepository,
    private gitService: GitService,
    private agentRunner: AgentRunner,
    private getWindow: () => BrowserWindow | null,
  ) {}

  startAll(): void {
    const projects = this.projectRepo.getAll()
    for (const project of projects) {
      this.add(project)
    }
  }

  add(project: Project): void {
    if (this.souls.has(project.id)) {
      log.warn('soul already exists', { project: project.id })
      return
    }

    const soul = new Soul({
      projectId: project.id,
      projectPath: project.path,
      getWindow: this.getWindow,
      projectRepo: this.projectRepo,
      milestoneRepo: this.milestoneRepo,
      backlogRepo: this.backlogRepo,
      commentRepo: this.commentRepo,
    })

    const notifier = new Notifier(project.id, this.getWindow)

    // Register the unified agent dispatch task
    const dispatchTask = new AgentDispatchTask({
      projectId: project.id,
      projectPath: project.path,
      projectRepo: this.projectRepo,
      milestoneRepo: this.milestoneRepo,
      commentRepo: this.commentRepo,
      gitService: this.gitService,
      agentRunner: this.agentRunner,
      notifier,
    })
    soul.register('dispatch-agent', dispatchTask)
    soul.register('plan-milestone', dispatchTask)

    this.souls.set(project.id, soul)

    // Auto-wake if project has ready milestones or was active
    const milestones = this.milestoneRepo.getByProjectId(project.id)
    const hasWork = milestones.some((m) => m.status === 'ready' || m.status === 'in_progress' || m.status === 'planning')
    if (hasWork || project.status === 'busy' || project.status === 'idle') {
      soul.wake()
    }

    log.info('added soul', { project: project.id })
  }

  remove(projectId: string): void {
    const soul = this.souls.get(projectId)
    if (soul) {
      soul.destroy()
      this.souls.delete(projectId)
      log.info('removed soul', { project: projectId })
    }
  }

  wake(projectId: string): void {
    this.souls.get(projectId)?.wake()
  }

  updateSchedule(projectId: string, schedule: WakeSchedule): void {
    this.projectRepo.patch(projectId, { wakeSchedule: schedule })
    this.souls.get(projectId)?.updateSchedule(schedule)
  }

  async transition(projectId: string, milestoneId: string, payload: TransitionPayload): Promise<void> {
    const lifecycle = this.getLifecycle(projectId)

    switch (payload.action) {
      case 'cancel': {
        const soul = this.souls.get(projectId)
        soul?.abort()
        lifecycle.cancel(projectId, milestoneId)
        break
      }
      case 'close': {
        const soul = this.souls.get(projectId)
        soul?.abort()
        lifecycle.close(projectId, milestoneId)
        break
      }
      case 'accept':
        await lifecycle.accept(projectId, milestoneId)
        // Only wake if there's more work to do (other ready/in-progress milestones)
        this.wakeIfHasWork(projectId)
        break
      case 'rollback':
        await lifecycle.rollback(projectId, milestoneId)
        // Rollback sets milestone to 'ready' — wake to pick it up
        this.wakeIfHasWork(projectId)
        break
      case 'request_changes':
        if (!payload.comment) throw new Error('request_changes requires a comment')
        lifecycle.requestChanges(projectId, milestoneId, payload.comment)
        // request_changes sets milestone to 'ready' — always wake
        this.souls.get(projectId)?.wake()
        break
      default:
        throw new Error(`Unsupported scheduler action: ${payload.action}`)
    }
  }

  async getMilestoneGitStatus(projectId: string, milestoneId: string): Promise<MilestoneGitInfo | null> {
    const project = this.projectRepo.getById(projectId)
    if (!project) return null
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone) return null

    const branch = `milestone/${milestoneId}`
    const baseCommit = milestone.baseCommit
    if (!baseCommit) return null

    try {
      const commitCount = await this.gitService.getCommitCountSince(project.path, baseCommit)
      const diffStats = await this.gitService.getDiffStats(project.path, baseCommit, 'HEAD')
      return { branch, commitCount, diffStats }
    } catch (err) {
      log.warn('failed to get milestone git status', { error: String(err) })
      return null
    }
  }

  stopAll(): void {
    for (const soul of this.souls.values()) {
      soul.destroy()
    }
    this.souls.clear()
  }

  private getLifecycle(projectId: string): MilestoneLifecycle {
    if (!this.lifecycle) {
      this.lifecycle = new MilestoneLifecycle(
        this.projectRepo,
        this.milestoneRepo,
        this.commentRepo,
        this.backlogRepo,
        this.milestoneItemRepo,
        this.gitService,
        new Notifier(projectId, this.getWindow)
      )
    }
    return this.lifecycle
  }

  /** Only wake the soul if there are ready or in-progress milestones to work on */
  private wakeIfHasWork(projectId: string): void {
    const milestones = this.milestoneRepo.getByProjectId(projectId)
    const hasWork = milestones.some((m) => m.status === 'ready' || m.status === 'in_progress' || m.status === 'planning')
    if (hasWork) {
      this.souls.get(projectId)?.wake()
    }
  }
}
