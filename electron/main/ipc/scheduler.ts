import { ipcMain } from 'electron'
import type { ServiceContext } from './index'
import type { WakeSchedule } from '../../../src/types/index'

export function registerSchedulerIPC(ctx: ServiceContext): void {
  const { schedulerService } = ctx

  ipcMain.handle('project:getState', (_, projectPath: string) => {
    return schedulerService.getState(projectPath)
  })

  ipcMain.handle('project:wake', (_, projectId: string) => {
    schedulerService.wakeNow(projectId)
  })

  // Fixed: no more state double-write bug — SchedulerService.updateSchedule handles both
  ipcMain.handle('project:updateSchedule', (_, projectId: string, _projectPath: string, schedule: WakeSchedule) => {
    schedulerService.updateSchedule(projectId, schedule)
  })

  ipcMain.handle('milestone:cancel', (_, projectId: string, _projectPath: string, milestoneId: string) => {
    schedulerService.cancelMilestone(projectId, milestoneId)
  })
}
