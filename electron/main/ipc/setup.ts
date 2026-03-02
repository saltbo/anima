import { ipcMain } from 'electron'
import { checkProjectSetup, readSetupFiles, startSetupSession, writeSetupFile } from '../setup'
import type { SetupType } from '../setup'

export function registerSetupIPC(): void {
  ipcMain.handle('setup:check', (_, projectPath: string) => {
    return checkProjectSetup(projectPath)
  })

  ipcMain.handle('setup:readFiles', (_, projectPath: string) => {
    return readSetupFiles(projectPath)
  })

  ipcMain.handle('setup:writeFile', (_, projectPath: string, type: 'vision' | 'soul', content: string) => {
    writeSetupFile(projectPath, type, content)
  })

  ipcMain.handle('setup:startAgent', (_, id: string, projectPath: string, type: SetupType, userContext?: string) => {
    startSetupSession(id, projectPath, type, userContext)
  })
}
