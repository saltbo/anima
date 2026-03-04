import { ipcMain } from 'electron'
import { createLogger } from '../logger'
import type { ApiHandler } from './routes'

const log = createLogger('ipc')

export interface IpcError {
  __ipcError: true
  message: string
  channel: string
}

/**
 * Register all routes as ipcMain.handle handlers.
 * Each handler strips the IpcMainInvokeEvent and delegates to the route handler.
 */
export function registerIpcAdapter(routes: Record<string, ApiHandler>): void {
  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await handler(...args)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error(`IPC error on "${channel}":`, message)
        return { __ipcError: true, message, channel } satisfies IpcError
      }
    })
  }
}
