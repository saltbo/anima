import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import { updateTray } from '../app/tray'

export function registerProjectsIPC(getWindow: () => BrowserWindow | null, ctx: ServiceContext): void {
  const { projectService, soulService } = ctx

  safeHandle('projects:list', () => {
    return projectService.list()
  })

  safeHandle('projects:add', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
      buttonLabel: 'Add Project',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const project = projectService.add(result.filePaths[0])
    soulService.add(project)

    getWindow()?.webContents.send('projects:changed', projectService.list())
    updateTray(projectService, getWindow)

    return project
  })

  safeHandle('projects:remove', (_, id: string) => {
    soulService.remove(id)
    projectService.remove(id)

    getWindow()?.webContents.send('projects:changed', projectService.list())
    updateTray(projectService, getWindow)

    return true
  })
}
