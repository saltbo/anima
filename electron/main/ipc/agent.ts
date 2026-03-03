import { findSessionFile, readEventsFromFile } from '../agents/claude-code/parser'
import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'

export function registerAgentIPC(ctx: ServiceContext): void {
  const { milestoneService } = ctx

  safeHandle('agent:readSessionEvents', (_, sessionId: string) => {
    const filePath = findSessionFile(sessionId)
    if (!filePath) return []
    return readEventsFromFile(filePath, 0).events
  })

  safeHandle('agent:sendMessage', (_, projectId: string, sessionId: string, message: string) => {
    milestoneService.resumePlanningSession(projectId, sessionId, message)
  })

  safeHandle('agent:stop', (_) => {
    // With stateless resume model, there's no long-running process to stop.
    // The agent process exits on its own after each message.
  })
}
