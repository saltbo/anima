import type { BrowserWindow } from 'electron'
import { conversationAgent, agentManager } from '../agents/service'
import { findSessionFile, readEventsFromFile } from '../agents/claude-code/parser'
import { safeHandle } from './safeHandle'

export function registerAgentIPC(getWindow: () => BrowserWindow | null): void {
  agentManager.on('events', (agentKey: string, events: unknown[]) => {
    getWindow()?.webContents.send('agent:events', agentKey, events)
  })

  safeHandle('agent:readEvents', (_, agentKey: string) => {
    return agentManager.readEvents(agentKey)
  })

  safeHandle('agent:readSessionEvents', (_, sessionId: string) => {
    const filePath = findSessionFile(sessionId)
    if (!filePath) return []
    return readEventsFromFile(filePath, 0).events
  })

  safeHandle('agent:sendMessage', (_, id: string, message: string) => {
    conversationAgent.send(id, message)
  })

  safeHandle('agent:stop', (_, id: string) => {
    conversationAgent.stop(id)
  })
}
