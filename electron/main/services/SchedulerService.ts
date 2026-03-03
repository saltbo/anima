import type { BrowserWindow } from 'electron'
import { ProjectScheduler } from '../scheduler/ProjectScheduler'
import type { Project, WakeSchedule, MilestoneGitInfo } from '../../../src/types/index'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { GitService } from './GitService'
import type { ConversationAgent } from './types'
import { createLogger } from '../logger'

const log = createLogger('scheduler-service')

export class SchedulerService {
  private schedulers = new Map<string, ProjectScheduler>()

  constructor(
    private projectRepo: ProjectRepository,
    private milestoneRepo: MilestoneRepository,
    private commentRepo: CommentRepository,
    private gitService: GitService,
    private conversationAgent: ConversationAgent,
    private getWindow: () => BrowserWindow | null
  ) {}

  startAll(): void {
    const projects = this.projectRepo.getAll()
    for (const project of projects) {
      this.add(project)
    }
  }

  add(project: Project): void {
    if (this.schedulers.has(project.id)) {
      log.warn('scheduler already exists', { project: project.id })
      return
    }
    const scheduler = new ProjectScheduler({
      projectId: project.id,
      projectPath: project.path,
      getWindow: this.getWindow,
      projectRepo: this.projectRepo,
      milestoneRepo: this.milestoneRepo,
      commentRepo: this.commentRepo,
      gitService: this.gitService,
      conversationAgent: this.conversationAgent,
    })
    this.schedulers.set(project.id, scheduler)
    scheduler.start()
    log.info('added scheduler', { project: project.id })
  }

  remove(projectId: string): void {
    const scheduler = this.schedulers.get(projectId)
    if (scheduler) {
      scheduler.stop()
      this.schedulers.delete(projectId)
      log.info('removed scheduler', { project: projectId })
    }
  }

  wakeNow(projectId: string): void {
    this.schedulers.get(projectId)?.wakeNow()
  }

  updateSchedule(projectId: string, schedule: WakeSchedule): void {
    this.projectRepo.patch(projectId, { wakeSchedule: schedule })
    this.schedulers.get(projectId)?.updateSchedule(schedule)
  }

  cancelMilestone(projectId: string, milestoneId: string): void {
    this.schedulers.get(projectId)?.cancelMilestone(milestoneId)
  }

  async acceptMilestone(projectId: string, milestoneId: string): Promise<void> {
    await this.schedulers.get(projectId)?.acceptMilestone(milestoneId)
  }

  async rollbackMilestone(projectId: string, milestoneId: string): Promise<void> {
    await this.schedulers.get(projectId)?.rollbackMilestone(milestoneId)
  }

  requestChanges(projectId: string, milestoneId: string, comment: { id: string; body: string }): void {
    this.schedulers.get(projectId)?.requestChanges(milestoneId, comment)
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
    for (const scheduler of this.schedulers.values()) {
      scheduler.stop()
    }
    this.schedulers.clear()
  }
}
