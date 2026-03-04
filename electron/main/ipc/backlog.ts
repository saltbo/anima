import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import type { BacklogItem, BacklogItemPriority } from '../../../src/types/index'

export function registerBacklogIPC(ctx: ServiceContext): void {
  const { backlogService } = ctx

  safeHandle('backlog:list', (_, projectId: string) => {
    return backlogService.getItems(projectId)
  })

  safeHandle('backlog:add', (_, projectId: string, item: Omit<BacklogItem, 'id' | 'createdAt' | 'status'> & { priority: BacklogItemPriority }) => {
    return backlogService.addItem(projectId, item)
  })

  safeHandle('backlog:update', (_, _projectId: string, id: string, patch: Partial<BacklogItem>) => {
    return backlogService.updateItem(id, patch)
  })

  safeHandle('backlog:delete', (_, _projectId: string, id: string) => {
    backlogService.deleteItem(id)
  })
}
