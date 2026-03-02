import type { BrowserWindow } from 'electron'
import { ProjectScheduler } from '../scheduler/ProjectScheduler'
import type { Project, WakeSchedule } from '../../../src/types/index'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { GitService } from './GitService'
import { createLogger } from '../logger'

const log = createLogger('scheduler-service')

export class SchedulerService {
  private schedulers = new Map<string, ProjectScheduler>()

  constructor(
    private projectRepo: ProjectRepository,
    private milestoneRepo: MilestoneRepository,
    private gitService: GitService,
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
      gitService: this.gitService,
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

  stopAll(): void {
    for (const scheduler of this.schedulers.values()) {
      scheduler.stop()
    }
    this.schedulers.clear()
  }
}
