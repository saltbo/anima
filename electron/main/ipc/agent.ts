import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { conversationAgent, agentManager } from '../agents/service'
import { findSessionFile, readEventsFromFile } from '../agents/claude-code/parser'

export function registerAgentIPC(getWindow: () => BrowserWindow | null): void {
  agentManager.on('events', (agentKey: string, events: unknown[]) => {
    getWindow()?.webContents.send('agent:events', agentKey, events)
  })

  ipcMain.handle('agent:readEvents', (_, agentKey: string) => {
    return agentManager.readEvents(agentKey)
  })

  ipcMain.handle('agent:readSessionEvents', (_, sessionId: string) => {
    const filePath = findSessionFile(sessionId)
    if (!filePath) return []
    return readEventsFromFile(filePath, 0).events
  })

  ipcMain.handle('agent:sendMessage', (_, id: string, message: string) => {
    conversationAgent.send(id, message)
  })

  ipcMain.handle('agent:stop', (_, id: string) => {
    conversationAgent.stop(id)
  })
}
