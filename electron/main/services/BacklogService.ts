import type { BacklogItem } from '../../../src/types/index'
import type { BacklogRepository } from '../repositories/BacklogRepository'

export class BacklogService {
  constructor(private backlogRepo: BacklogRepository) {}

  getItems(projectId: string): BacklogItem[] {
    return this.backlogRepo.getByProjectId(projectId)
  }

  addItem(projectId: string, item: Omit<BacklogItem, 'id' | 'createdAt' | 'status'>): BacklogItem {
    return this.backlogRepo.add(projectId, item)
  }

  updateItem(id: string, patch: Partial<BacklogItem>): BacklogItem | null {
    return this.backlogRepo.update(id, patch)
  }

  deleteItem(id: string): void {
    this.backlogRepo.delete(id)
  }
}
