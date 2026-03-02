import { ipcMain } from 'electron'
import type { ServiceContext } from './index'
import type { SetupType } from '../services/SetupService'

export function registerSetupIPC(ctx: ServiceContext): void {
  const { setupService } = ctx

  ipcMain.handle('setup:check', (_, projectPath: string) => {
    return setupService.checkProjectSetup(projectPath)
  })

  ipcMain.handle('setup:readFiles', (_, projectPath: string) => {
    return setupService.readSetupFiles(projectPath)
  })

  ipcMain.handle('setup:writeFile', (_, projectPath: string, type: 'vision' | 'soul', content: string) => {
    setupService.writeSetupFile(projectPath, type, content)
  })

  ipcMain.handle('setup:startAgent', (_, id: string, projectPath: string, type: SetupType, userContext?: string) => {
    setupService.startSetupSession(id, projectPath, type, userContext)
  })

  ipcMain.handle('setup:listTemplates', () => {
    return setupService.listSoulTemplates()
  })

  ipcMain.handle('setup:applyTemplate', (_, projectPath: string, templateId: string) => {
    setupService.applySoulTemplate(projectPath, templateId)
  })

  ipcMain.handle('setup:startSoulAgent', (_, id: string, projectPath: string, templateId: string) => {
    setupService.startSoulSession(id, projectPath, templateId)
  })
}
