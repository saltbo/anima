import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { addProject, getProjects, removeProject } from './store'
import { updateTray } from './tray'

export function setupIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('get-projects', () => {
    return getProjects()
  })

  ipcMain.handle('add-project', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
      buttonLabel: 'Add Project',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const projectPath = result.filePaths[0]
    const project = addProject(projectPath)

    const win = getWindow()
    if (win) {
      win.webContents.send('projects-updated', getProjects())
    }
    updateTray(getProjects(), getWindow)

    return project
  })

  ipcMain.handle('remove-project', (_, id: string) => {
    removeProject(id)

    const win = getWindow()
    if (win) {
      win.webContents.send('projects-updated', getProjects())
    }
    updateTray(getProjects(), getWindow)

    return true
  })

  ipcMain.handle('navigate-to', (_, path: string) => {
    const win = getWindow()
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('navigate', path)
    }
  })
}
