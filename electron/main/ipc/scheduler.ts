import { ipcMain } from 'electron'
import type { ServiceContext } from './index'
import type { WakeSchedule } from '../../../src/types/index'

export function registerSchedulerIPC(ctx: ServiceContext): void {
  const { schedulerService } = ctx

  ipcMain.handle('project:wake', (_, projectId: string) => {
    schedulerService.wakeNow(projectId)
  })

  ipcMain.handle('project:updateSchedule', (_, projectId: string, schedule: WakeSchedule) => {
    schedulerService.updateSchedule(projectId, schedule)
  })

  ipcMain.handle('milestone:cancel', (_, projectId: string, milestoneId: string) => {
    schedulerService.cancelMilestone(projectId, milestoneId)
  })
}
