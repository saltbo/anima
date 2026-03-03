import { findSessionFile, readEventsFromFile } from '../agents/claude-code/parser'
import { safeHandle } from './safeHandle'

export function registerAgentIPC(): void {
  // Agent event forwarding is now handled per-session by AgentRunner's onEvent callback.
  // The UI reads historical events via sessionId from iteration records.

  safeHandle('agent:readEvents', (_, _agentKey: string) => {
    // Legacy: no longer have live agent registry. Return empty.
    return []
  })

  safeHandle('agent:readSessionEvents', (_, sessionId: string) => {
    const filePath = findSessionFile(sessionId)
    if (!filePath) return []
    return readEventsFromFile(filePath, 0).events
  })

  safeHandle('agent:sendMessage', (_, _id: string, _message: string) => {
    // Planning sessions now use AgentRunner (not interactive).
    // Interactive send is no longer supported from the UI.
  })

  safeHandle('agent:stop', (_, _id: string) => {
    // No-op: sessions are managed by AgentRunner lifecycle
  })
}
