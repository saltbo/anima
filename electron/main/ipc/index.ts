import type { BrowserWindow } from 'electron'
import type { ProjectService } from '../services/ProjectService'
import type { BacklogService } from '../services/BacklogService'
import type { MilestoneService } from '../services/MilestoneService'
import type { SoulService } from '../services/SoulService'
import type { SetupService } from '../services/SetupService'
import type { CommentRepository } from '../repositories/CommentRepository'
import { registerProjectsIPC } from './projects'
import { registerWindowIPC } from './window'
import { registerSetupIPC } from './setup'
import { registerAgentIPC } from './agent'
import { registerBacklogIPC } from './backlog'
import { registerMilestonesIPC } from './milestones'
import { registerSchedulerIPC } from './scheduler'

export type { IpcError } from './safeHandle'

export interface ServiceContext {
  projectService: ProjectService
  backlogService: BacklogService
  milestoneService: MilestoneService
  soulService: SoulService
  setupService: SetupService
  commentRepo: CommentRepository
}

export function setupIPC(getWindow: () => BrowserWindow | null, ctx: ServiceContext): void {
  registerProjectsIPC(getWindow, ctx)
  registerWindowIPC(getWindow)
  registerSetupIPC(ctx)
  registerAgentIPC(ctx)
  registerBacklogIPC(ctx)
  registerMilestonesIPC(ctx)
  registerSchedulerIPC(ctx)
}
