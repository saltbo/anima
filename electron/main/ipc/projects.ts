import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { addProject, getProjects, removeProject } from '../data/store'
import { updateTray } from '../app/tray'
import { schedulerManager } from '../scheduler'

export function registerProjectsIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('projects:list', () => {
    return getProjects()
  })

  ipcMain.handle('projects:add', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
      buttonLabel: 'Add Project',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const project = addProject(result.filePaths[0])
    schedulerManager.add(project)

    getWindow()?.webContents.send('projects:changed', getProjects())
    updateTray(getProjects(), getWindow)

    return project
  })

  ipcMain.handle('projects:remove', (_, id: string) => {
    schedulerManager.remove(id)
    removeProject(id)

    getWindow()?.webContents.send('projects:changed', getProjects())
    updateTray(getProjects(), getWindow)

    return true
  })
}
