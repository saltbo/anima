import { ipcMain } from 'electron'
import { getProjectState, patchProjectState } from '../data/state'
import { schedulerManager } from '../scheduler'
import type { WakeSchedule } from '../../../src/types/index'

export function registerSchedulerIPC(): void {
  ipcMain.handle('project:getState', (_, projectPath: string) => {
    return getProjectState(projectPath)
  })

  ipcMain.handle('project:wake', (_, projectId: string) => {
    schedulerManager.wakeNow(projectId)
  })

  ipcMain.handle('project:updateSchedule', (_, projectId: string, projectPath: string, schedule: WakeSchedule) => {
    schedulerManager.updateSchedule(projectId, schedule)
    patchProjectState(projectPath, { wakeSchedule: schedule })
  })
}
