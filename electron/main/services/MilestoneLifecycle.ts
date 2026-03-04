import { createLogger } from '../logger'
import { nowISO } from '../lib/time'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { GitService } from './GitService'
import { Notifier } from '../soul/notifier'

const log = createLogger('milestone-lifecycle')

export class MilestoneLifecycle {
  constructor(
    private projectRepo: ProjectRepository,
    private milestoneRepo: MilestoneRepository,
    private commentRepo: CommentRepository,
    private gitService: GitService,
    private notifier: Notifier
  ) {}

  async accept(projectId: string, milestoneId: string): Promise<void> {
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone || milestone.status !== 'awaiting_review') {
      log.warn('cannot accept milestone in status', { status: milestone?.status })
      return
    }

    const project = this.projectRepo.getById(projectId)
    if (!project) return

    const defaultBranch = await this.gitService.getDefaultBranch(project.path)
    const branch = `milestone/${milestoneId}`
    await this.gitService.squashMerge(project.path, branch, defaultBranch, `feat: ${milestone.title}`)
    await this.gitService.deleteBranch(project.path, branch)

    this.milestoneRepo.save(projectId, {
      ...milestone,
      status: 'completed',
      completedAt: nowISO(),
    })
    this.projectRepo.patch(projectId, { status: 'sleeping' })
    this.broadcastStatus(projectId)
    this.notifier.notifyMilestoneCompleted(milestoneId)
    this.notifier.broadcastMilestoneUpdate({ ...milestone, status: 'completed', completedAt: nowISO() })
    log.info('milestone accepted and merged', { milestone: milestoneId })
  }

  async rollback(projectId: string, milestoneId: string): Promise<void> {
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone || (milestone.status !== 'awaiting_review' && milestone.status !== 'cancelled')) {
      log.warn('cannot rollback milestone in status', { status: milestone?.status })
      return
    }
    if (!milestone.baseCommit) {
      log.warn('no baseCommit for rollback', { milestone: milestoneId })
      return
    }

    const project = this.projectRepo.getById(projectId)
    if (!project) return

    const branch = `milestone/${milestoneId}`
    await this.gitService.resetBranchToCommit(project.path, branch, milestone.baseCommit)

    this.milestoneRepo.save(projectId, {
      ...milestone,
      status: 'ready',
      iterationCount: 0,
      completedAt: undefined,
    })
    this.projectRepo.patch(projectId, { status: 'sleeping' })
    this.broadcastStatus(projectId)
    this.notifier.broadcastMilestoneUpdate({ ...milestone, status: 'ready', iterationCount: 0 })
    log.info('milestone rolled back', { milestone: milestoneId })
  }

  requestChanges(projectId: string, milestoneId: string, comment: { id: string; body: string }): void {
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone) return
    if (milestone.status !== 'awaiting_review') {
      log.warn('cannot request changes in status', { status: milestone.status })
      return
    }

    const now = nowISO()
    this.commentRepo.add({
      id: comment.id,
      milestoneId,
      body: comment.body,
      author: 'human',
      createdAt: now,
      updatedAt: now,
    })

    this.milestoneRepo.save(projectId, { ...milestone, status: 'ready' })
    this.notifier.broadcastMilestoneUpdate({ ...milestone, status: 'ready' })
    log.info('changes requested, milestone set to ready', { milestone: milestoneId })
  }

  cancel(projectId: string, milestoneId: string): void {
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone) return

    if (milestone.status !== 'ready' && milestone.status !== 'in-progress') {
      log.warn('cannot cancel milestone in status', { status: milestone.status })
      return
    }

    this.milestoneRepo.save(projectId, { ...milestone, status: 'cancelled' })
    this.projectRepo.patch(projectId, { status: 'sleeping', currentIteration: null })
    this.broadcastStatus(projectId)
    this.notifier.broadcastMilestoneUpdate({ ...milestone, status: 'cancelled' })
    log.info('milestone cancelled', { milestone: milestoneId })
  }

  close(projectId: string, milestoneId: string): void {
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone) return

    if (milestone.status === 'completed' || milestone.status === 'cancelled') {
      log.warn('cannot close milestone in status', { status: milestone.status })
      return
    }

    this.milestoneRepo.save(projectId, { ...milestone, status: 'cancelled' })
    this.projectRepo.patch(projectId, { status: 'sleeping', currentIteration: null })
    this.broadcastStatus(projectId)
    this.notifier.broadcastMilestoneUpdate({ ...milestone, status: 'cancelled' })
    log.info('milestone closed', { milestone: milestoneId })
  }

  private broadcastStatus(projectId: string): void {
    const project = this.projectRepo.getById(projectId)
    if (project) this.notifier.broadcastStatus(project)
  }
}
