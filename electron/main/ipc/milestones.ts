import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import type { Milestone, MilestoneTask, TransitionPayload } from '../../../src/types/index'

export function registerMilestonesIPC(ctx: ServiceContext): void {
  const { milestoneService } = ctx

  safeHandle('milestones:list', (_, projectId: string) => {
    return milestoneService.getMilestones(projectId)
  })

  safeHandle('milestones:save', (_, projectId: string, milestone: Milestone) => {
    milestoneService.saveMilestone(projectId, milestone)
  })

  safeHandle('milestones:delete', (_, projectId: string, id: string) => {
    milestoneService.deleteMilestone(projectId, id)
  })

  safeHandle('milestones:updateTask', (_, _projectId: string, milestoneId: string, taskId: string, patch: Partial<MilestoneTask>) => {
    milestoneService.updateMilestoneTask(milestoneId, taskId, patch)
  })

  safeHandle('milestones:readDoc', (_, projectId: string, id: string) => {
    return milestoneService.readMilestoneMarkdown(projectId, id)
  })

  safeHandle('milestones:writeDoc', (_, projectId: string, id: string, content: string) => {
    milestoneService.writeMilestoneMarkdown(projectId, id, content)
  })

  safeHandle('milestones:startPlanning', (_, id: string, projectId: string, inboxItemIds: string[], title: string, description: string) => {
    milestoneService.startPlanningSession(id, projectId, inboxItemIds, title, description)
  })

  safeHandle('milestones:transition', async (_, projectId: string, milestoneId: string, payload: TransitionPayload) => {
    await milestoneService.transition(projectId, milestoneId, payload)
  })
}
