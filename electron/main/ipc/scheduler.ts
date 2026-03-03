import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import type { WakeSchedule } from '../../../src/types/index'

export function registerSchedulerIPC(ctx: ServiceContext): void {
  const { schedulerService } = ctx

  safeHandle('project:wake', (_, projectId: string) => {
    schedulerService.wakeNow(projectId)
  })

  safeHandle('project:updateSchedule', (_, projectId: string, schedule: WakeSchedule) => {
    schedulerService.updateSchedule(projectId, schedule)
  })

  safeHandle('milestone:cancel', (_, projectId: string, milestoneId: string) => {
    schedulerService.cancelMilestone(projectId, milestoneId)
  })
}
