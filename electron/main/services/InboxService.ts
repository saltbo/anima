import type { InboxItem } from '../../../src/types/index'
import type { InboxRepository } from '../repositories/InboxRepository'

export class InboxService {
  constructor(private inboxRepo: InboxRepository) {}

  getItems(projectId: string): InboxItem[] {
    return this.inboxRepo.getByProjectId(projectId)
  }

  addItem(projectId: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>): InboxItem {
    return this.inboxRepo.add(projectId, item)
  }

  updateItem(id: string, patch: Partial<InboxItem>): InboxItem | null {
    return this.inboxRepo.update(id, patch)
  }

  deleteItem(id: string): void {
    this.inboxRepo.delete(id)
  }
}
