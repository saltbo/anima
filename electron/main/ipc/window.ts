import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'

export function registerWindowIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:navigate', (_, path: string) => {
    const win = getWindow()
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('window:navigate', path)
    }
  })
}
