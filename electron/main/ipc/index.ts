import type { BrowserWindow } from 'electron'
import type { ProjectService } from '../services/ProjectService'
import type { InboxService } from '../services/InboxService'
import type { MilestoneService } from '../services/MilestoneService'
import type { SoulService } from '../services/SoulService'
import type { SetupService } from '../services/SetupService'
import type { CommentRepository } from '../repositories/CommentRepository'
import { registerProjectsIPC } from './projects'
import { registerWindowIPC } from './window'
import { registerSetupIPC } from './setup'
import { registerAgentIPC } from './agent'
import { registerInboxIPC } from './inbox'
import { registerMilestonesIPC } from './milestones'
import { registerSchedulerIPC } from './scheduler'

export type { IpcError } from './safeHandle'

export interface ServiceContext {
  projectService: ProjectService
  inboxService: InboxService
  milestoneService: MilestoneService
  soulService: SoulService
  setupService: SetupService
  commentRepo: CommentRepository
}

export function setupIPC(getWindow: () => BrowserWindow | null, ctx: ServiceContext): void {
  registerProjectsIPC(getWindow, ctx)
  registerWindowIPC(getWindow)
  registerSetupIPC(ctx)
  registerAgentIPC()
  registerInboxIPC(ctx)
  registerMilestonesIPC(ctx)
  registerSchedulerIPC(ctx)
}
