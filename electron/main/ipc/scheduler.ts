import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import type { WakeSchedule } from '../../../src/types/index'

export function registerSchedulerIPC(ctx: ServiceContext): void {
  const { schedulerService, commentRepo } = ctx

  safeHandle('project:wake', (_, projectId: string) => {
    schedulerService.wakeNow(projectId)
  })

  safeHandle('project:updateSchedule', (_, projectId: string, schedule: WakeSchedule) => {
    schedulerService.updateSchedule(projectId, schedule)
  })

  safeHandle('milestone:cancel', (_, projectId: string, milestoneId: string) => {
    schedulerService.cancelMilestone(projectId, milestoneId)
  })

  safeHandle('milestone:accept', async (_, projectId: string, milestoneId: string) => {
    await schedulerService.acceptMilestone(projectId, milestoneId)
  })

  safeHandle('milestone:rollback', async (_, projectId: string, milestoneId: string) => {
    await schedulerService.rollbackMilestone(projectId, milestoneId)
  })

  safeHandle('milestone:requestChanges', (_, projectId: string, milestoneId: string, comment: { id: string; body: string }) => {
    schedulerService.requestChanges(projectId, milestoneId, comment)
  })

  safeHandle('milestone:gitStatus', async (_, projectId: string, milestoneId: string) => {
    return schedulerService.getMilestoneGitStatus(projectId, milestoneId)
  })

  safeHandle('milestone:comments', (_, milestoneId: string) => {
    return commentRepo.getByMilestoneId(milestoneId)
  })

  safeHandle('milestone:addComment', (_, comment: { id: string; milestoneId: string; body: string; author: 'human' | 'system'; createdAt: string; updatedAt: string }) => {
    commentRepo.add(comment)
  })

  safeHandle('project:updateAutoMerge', (_, projectId: string, autoMerge: boolean) => {
    ctx.projectService.patch(projectId, { autoMerge })
  })
}
