import { ipcMain } from 'electron'
import { createLogger } from '../logger'

const log = createLogger('ipc')

export interface IpcError {
  __ipcError: true
  message: string
  channel: string
}

/**
 * Wrapper around ipcMain.handle that catches all errors and returns
 * a structured IpcError instead of letting exceptions propagate
 * as opaque Electron IPC failures.
 */
export function safeHandle(
  channel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error(`IPC error on "${channel}":`, message)
      return { __ipcError: true, message, channel } satisfies IpcError
    }
  })
}
