import type { BrowserWindow } from 'electron'
import { registerProjectsIPC } from './projects'
import { registerWindowIPC } from './window'
import { registerSetupIPC } from './setup'
import { registerAgentIPC } from './agent'
import { registerInboxIPC } from './inbox'
import { registerMilestonesIPC } from './milestones'
import { registerSchedulerIPC } from './scheduler'

export function setupIPC(getWindow: () => BrowserWindow | null): void {
  registerProjectsIPC(getWindow)
  registerWindowIPC(getWindow)
  registerSetupIPC()
  registerAgentIPC(getWindow)
  registerInboxIPC()
  registerMilestonesIPC(getWindow)
  registerSchedulerIPC()
}
