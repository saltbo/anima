import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import type { WakeSchedule } from '../../../src/types/index'

export function registerSchedulerIPC(ctx: ServiceContext): void {
  const { soulService, commentRepo } = ctx

  safeHandle('project:wake', (_, projectId: string) => {
    soulService.wake(projectId)
  })

  safeHandle('project:updateSchedule', (_, projectId: string, schedule: WakeSchedule) => {
    soulService.updateSchedule(projectId, schedule)
  })

  safeHandle('milestone:gitStatus', async (_, projectId: string, milestoneId: string) => {
    return soulService.getMilestoneGitStatus(projectId, milestoneId)
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

  safeHandle('project:updateAutoApprove', (_, projectId: string, autoApprove: boolean) => {
    ctx.projectService.patch(projectId, { autoApprove })
  })
}
