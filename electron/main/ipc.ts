import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { addProject, getProjects, removeProject } from './store'
import { updateTray } from './tray'
import {
  checkProjectSetup,
  readSetupFiles,
  startSetupSession,
  sendSetupMessage,
  stopSetupSession,
  writeSetupFile,
} from './setup'
import type { SetupType } from './setup'
import {
  getInboxItems,
  addInboxItem,
  updateInboxItem,
  deleteInboxItem,
  getMilestones,
  saveMilestone,
  deleteMilestone,
  updateMilestoneTask,
  startMilestonePlanningSession,
} from './milestones'
import type { InboxItem, MilestoneTask } from '../../src/types/index'

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

  ipcMain.handle('check-project-setup', (_, projectPath: string) => {
    return checkProjectSetup(projectPath)
  })

  ipcMain.handle('read-setup-files', (_, projectPath: string) => {
    return readSetupFiles(projectPath)
  })

  ipcMain.handle('start-setup-session', (_, id: string, projectPath: string, type: SetupType) => {
    const win = getWindow()
    if (win) startSetupSession(id, projectPath, type, win)
  })

  ipcMain.handle('send-setup-message', (_, id: string, message: string) => {
    sendSetupMessage(id, message)
  })

  ipcMain.handle('stop-setup-session', (_, id: string) => {
    stopSetupSession(id)
  })

  ipcMain.handle('write-setup-file', (_, projectPath: string, type: SetupType, content: string) => {
    writeSetupFile(projectPath, type, content)
  })

  ipcMain.handle('get-inbox-items', (_, projectPath: string) => {
    return getInboxItems(projectPath)
  })

  ipcMain.handle('add-inbox-item', (_, projectPath: string, item: Omit<InboxItem, 'id' | 'createdAt'>) => {
    return addInboxItem(projectPath, item)
  })

  ipcMain.handle('update-inbox-item', (_, projectPath: string, id: string, patch: Partial<InboxItem>) => {
    return updateInboxItem(projectPath, id, patch)
  })

  ipcMain.handle('delete-inbox-item', (_, projectPath: string, id: string) => {
    deleteInboxItem(projectPath, id)
  })

  ipcMain.handle('get-milestones', (_, projectPath: string) => {
    return getMilestones(projectPath)
  })

  ipcMain.handle('save-milestone', (_, projectPath: string, milestone: Parameters<typeof saveMilestone>[1]) => {
    saveMilestone(projectPath, milestone)
  })

  ipcMain.handle('delete-milestone', (_, projectPath: string, id: string) => {
    deleteMilestone(projectPath, id)
  })

  ipcMain.handle('update-milestone-task', (_, projectPath: string, milestoneId: string, taskId: string, patch: Partial<MilestoneTask>) => {
    updateMilestoneTask(projectPath, milestoneId, taskId, patch)
  })

  ipcMain.handle('start-milestone-planning-session', (_, id: string, projectPath: string, inboxItemIds: string[]) => {
    const win = getWindow()
    if (win) startMilestonePlanningSession(id, projectPath, inboxItemIds, win)
  })
}
