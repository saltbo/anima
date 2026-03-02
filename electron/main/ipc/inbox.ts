import { ipcMain } from 'electron'
import type { ServiceContext } from './index'
import type { InboxItem, InboxItemPriority } from '../../../src/types/index'

export function registerInboxIPC(ctx: ServiceContext): void {
  const { inboxService } = ctx

  ipcMain.handle('inbox:list', (_, projectPath: string) => {
    return inboxService.getItems(projectPath)
  })

  ipcMain.handle('inbox:add', (_, projectPath: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'> & { priority: InboxItemPriority }) => {
    return inboxService.addItem(projectPath, item)
  })

  ipcMain.handle('inbox:update', (_, projectPath: string, id: string, patch: Partial<InboxItem>) => {
    return inboxService.updateItem(projectPath, id, patch)
  })

  ipcMain.handle('inbox:delete', (_, projectPath: string, id: string) => {
    inboxService.deleteItem(projectPath, id)
  })
}
