import { ipcMain } from 'electron'
import type { ServiceContext } from './index'
import type { Milestone, MilestoneTask } from '../../../src/types/index'

export function registerMilestonesIPC(ctx: ServiceContext): void {
  const { milestoneService } = ctx

  ipcMain.handle('milestones:list', (_, projectPath: string) => {
    return milestoneService.getMilestones(projectPath)
  })

  ipcMain.handle('milestones:save', (_, projectPath: string, milestone: Milestone) => {
    milestoneService.saveMilestone(projectPath, milestone)
  })

  ipcMain.handle('milestones:delete', (_, projectPath: string, id: string) => {
    milestoneService.deleteMilestone(projectPath, id)
  })

  ipcMain.handle('milestones:updateTask', (_, projectPath: string, milestoneId: string, taskId: string, patch: Partial<MilestoneTask>) => {
    milestoneService.updateMilestoneTask(projectPath, milestoneId, taskId, patch)
  })

  ipcMain.handle('milestones:readDoc', (_, projectPath: string, id: string) => {
    return milestoneService.readMilestoneMarkdown(projectPath, id)
  })

  ipcMain.handle('milestones:writeDoc', (_, projectPath: string, id: string, content: string) => {
    milestoneService.writeMilestoneMarkdown(projectPath, id, content)
  })

  ipcMain.handle('milestones:startPlanning', (_, id: string, projectPath: string, inboxItemIds: string[], title: string, description: string) => {
    milestoneService.startPlanningSession(id, projectPath, inboxItemIds, title, description)
  })
}
