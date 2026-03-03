import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import type { Project, WakeSchedule, MilestoneGitInfo, TransitionPayload } from '../../../src/types/index'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { GitService } from './GitService'
import { MilestoneLifecycle } from './MilestoneLifecycle'
import { Soul } from '../soul/Soul'
import { MilestoneExecutionTask } from '../soul/tasks/MilestoneExecutionTask'
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
    private gitService: GitService,
    private agentRunner: AgentRunner,
    private getWindow: () => BrowserWindow | null,
    private mcpServerPath: string,
    private dbPath: string
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
    })

    // Register the milestone execution task
    const executionTask = new MilestoneExecutionTask({
      projectId: project.id,
      projectPath: project.path,
      projectRepo: this.projectRepo,
      milestoneRepo: this.milestoneRepo,
      commentRepo: this.commentRepo,
      gitService: this.gitService,
      agentRunner: this.agentRunner,
      notifier: new Notifier(project.id, this.getWindow),
      mcpServerPath: this.mcpServerPath,
      dbPath: this.dbPath,
    })
    soul.register('execute-milestone', executionTask)

    this.souls.set(project.id, soul)

    // Auto-wake if project has ready milestones or was active
    const milestones = this.milestoneRepo.getByProjectId(project.id)
    const hasWork = milestones.some((m) => m.status === 'ready' || m.status === 'in-progress')
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
      case 'accept':
        await lifecycle.accept(projectId, milestoneId)
        this.souls.get(projectId)?.wake()
        break
      case 'rollback':
        await lifecycle.rollback(projectId, milestoneId)
        break
      case 'request_changes':
        if (!payload.comment) throw new Error('request_changes requires a comment')
        lifecycle.requestChanges(projectId, milestoneId, payload.comment)
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
        this.gitService,
        new Notifier(projectId, this.getWindow)
      )
    }
    return this.lifecycle
  }
}
