import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  getMilestones,
  saveMilestone,
  deleteMilestone,
  updateMilestoneTask,
  writeMilestoneMarkdown,
  readMilestoneMarkdown,
  startMilestonePlanningSession,
} from '../data/milestones'
import type { MilestoneTask } from '../../../src/types/index'

export function registerMilestonesIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('milestones:list', (_, projectPath: string) => {
    return getMilestones(projectPath)
  })

  ipcMain.handle('milestones:save', (_, projectPath: string, milestone: Parameters<typeof saveMilestone>[1]) => {
    saveMilestone(projectPath, milestone)
  })

  ipcMain.handle('milestones:delete', (_, projectPath: string, id: string) => {
    deleteMilestone(projectPath, id)
  })

  ipcMain.handle('milestones:updateTask', (_, projectPath: string, milestoneId: string, taskId: string, patch: Partial<MilestoneTask>) => {
    updateMilestoneTask(projectPath, milestoneId, taskId, patch)
  })

  ipcMain.handle('milestones:readDoc', (_, projectPath: string, id: string) => {
    return readMilestoneMarkdown(projectPath, id)
  })

  ipcMain.handle('milestones:writeDoc', (_, projectPath: string, id: string, content: string) => {
    writeMilestoneMarkdown(projectPath, id, content)
  })

  ipcMain.handle('milestones:startPlanning', (_, id: string, projectPath: string, inboxItemIds: string[], title: string, description: string) => {
    const win = getWindow()
    if (win) startMilestonePlanningSession(id, projectPath, inboxItemIds, title, description, win)
  })
}
