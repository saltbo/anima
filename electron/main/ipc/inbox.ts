import { ipcMain } from 'electron'
import { getInboxItems, addInboxItem, updateInboxItem, deleteInboxItem } from '../data/milestones'
import type { InboxItem, InboxItemPriority } from '../../../src/types/index'

export function registerInboxIPC(): void {
  ipcMain.handle('inbox:list', (_, projectPath: string) => {
    return getInboxItems(projectPath)
  })

  ipcMain.handle('inbox:add', (_, projectPath: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'> & { priority: InboxItemPriority }) => {
    return addInboxItem(projectPath, item)
  })

  ipcMain.handle('inbox:update', (_, projectPath: string, id: string, patch: Partial<InboxItem>) => {
    return updateInboxItem(projectPath, id, patch)
  })

  ipcMain.handle('inbox:delete', (_, projectPath: string, id: string) => {
    deleteInboxItem(projectPath, id)
  })
}
