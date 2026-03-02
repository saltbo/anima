import { ipcMain } from 'electron'
import type { ServiceContext } from './index'
import type { Milestone, MilestoneTask } from '../../../src/types/index'

export function registerMilestonesIPC(ctx: ServiceContext): void {
  const { milestoneService } = ctx

  ipcMain.handle('milestones:list', (_, projectId: string) => {
    return milestoneService.getMilestones(projectId)
  })

  ipcMain.handle('milestones:save', (_, projectId: string, milestone: Milestone) => {
    milestoneService.saveMilestone(projectId, milestone)
  })

  ipcMain.handle('milestones:delete', (_, projectId: string, id: string) => {
    milestoneService.deleteMilestone(projectId, id)
  })

  ipcMain.handle('milestones:updateTask', (_, _projectId: string, milestoneId: string, taskId: string, patch: Partial<MilestoneTask>) => {
    milestoneService.updateMilestoneTask(milestoneId, taskId, patch)
  })

  ipcMain.handle('milestones:readDoc', (_, projectId: string, id: string) => {
    return milestoneService.readMilestoneMarkdown(projectId, id)
  })

  ipcMain.handle('milestones:writeDoc', (_, projectId: string, id: string, content: string) => {
    milestoneService.writeMilestoneMarkdown(projectId, id, content)
  })

  ipcMain.handle('milestones:startPlanning', (_, id: string, projectId: string, inboxItemIds: string[], title: string, description: string) => {
    milestoneService.startPlanningSession(id, projectId, inboxItemIds, title, description)
  })
}
