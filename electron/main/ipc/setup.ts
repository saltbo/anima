import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import type { SetupType } from '../services/SetupService'

export function registerSetupIPC(ctx: ServiceContext): void {
  const { setupService } = ctx

  safeHandle('setup:check', (_, projectPath: string) => {
    return setupService.checkProjectSetup(projectPath)
  })

  safeHandle('setup:readFiles', (_, projectPath: string) => {
    return setupService.readSetupFiles(projectPath)
  })

  safeHandle('setup:writeFile', (_, projectPath: string, type: 'vision' | 'soul', content: string) => {
    setupService.writeSetupFile(projectPath, type, content)
  })

  safeHandle('setup:startAgent', (_, id: string, projectPath: string, type: SetupType, userContext?: string) => {
    return setupService.startSetupSession(id, projectPath, type, userContext)
  })

  safeHandle('setup:listTemplates', () => {
    return setupService.listSoulTemplates()
  })

  safeHandle('setup:applyTemplate', (_, projectPath: string, templateId: string) => {
    setupService.applySoulTemplate(projectPath, templateId)
  })

  safeHandle('setup:startSoulAgent', (_, id: string, projectPath: string, templateId: string) => {
    return setupService.startSoulSession(id, projectPath, templateId)
  })
}
