import type { BrowserWindow } from 'electron'
import { safeHandle } from './safeHandle'

export function registerWindowIPC(getWindow: () => BrowserWindow | null): void {
  safeHandle('window:navigate', (_, path: string) => {
    const win = getWindow()
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('window:navigate', path)
    }
  })
}
