import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import type { InboxItem, InboxItemPriority } from '../../../src/types/index'

export function registerInboxIPC(ctx: ServiceContext): void {
  const { inboxService } = ctx

  safeHandle('inbox:list', (_, projectId: string) => {
    return inboxService.getItems(projectId)
  })

  safeHandle('inbox:add', (_, projectId: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'> & { priority: InboxItemPriority }) => {
    return inboxService.addItem(projectId, item)
  })

  safeHandle('inbox:update', (_, _projectId: string, id: string, patch: Partial<InboxItem>) => {
    return inboxService.updateItem(id, patch)
  })

  safeHandle('inbox:delete', (_, _projectId: string, id: string) => {
    inboxService.deleteItem(id)
  })
}
