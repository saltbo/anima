import { findSessionFile, readEventsFromFile } from '../agents/claude-code/parser'
import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'

export function registerAgentIPC(_ctx: ServiceContext): void {
  safeHandle('agent:readSessionEvents', (_, sessionId: string) => {
    const filePath = findSessionFile(sessionId)
    if (!filePath) return []
    return readEventsFromFile(filePath, 0).events
  })

  safeHandle('agent:stop', (_) => {
    // With stateless resume model, there's no long-running process to stop.
    // The agent process exits on its own after each message.
  })
}
