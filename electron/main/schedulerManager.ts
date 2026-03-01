import type { BrowserWindow } from 'electron'
import { ProjectScheduler } from './scheduler'
import type { Project, WakeSchedule } from '../../src/types/index'
import { createLogger } from './logger'

const log = createLogger('scheduler-manager')

class SchedulerManager {
  private schedulers = new Map<string, ProjectScheduler>()
  private getWindow: (() => BrowserWindow | null) | null = null

  init(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow
  }

  startAll(projects: Project[]): void {
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
      getWindow: this.getWindow ?? (() => null),
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
    this.schedulers.get(projectId)?.updateSchedule(schedule)
  }

  stopAll(): void {
    for (const scheduler of this.schedulers.values()) {
      scheduler.stop()
    }
    this.schedulers.clear()
  }
}

export const schedulerManager = new SchedulerManager()
