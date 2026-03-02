import { ipcMain } from 'electron'
import type { ServiceContext } from './index'
import type { InboxItem, InboxItemPriority } from '../../../src/types/index'

export function registerInboxIPC(ctx: ServiceContext): void {
  const { inboxService } = ctx

  ipcMain.handle('inbox:list', (_, projectId: string) => {
    return inboxService.getItems(projectId)
  })

  ipcMain.handle('inbox:add', (_, projectId: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'> & { priority: InboxItemPriority }) => {
    return inboxService.addItem(projectId, item)
  })

  ipcMain.handle('inbox:update', (_, _projectId: string, id: string, patch: Partial<InboxItem>) => {
    return inboxService.updateItem(id, patch)
  })

  ipcMain.handle('inbox:delete', (_, _projectId: string, id: string) => {
    inboxService.deleteItem(id)
  })
}
