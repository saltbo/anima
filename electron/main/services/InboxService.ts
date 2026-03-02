import type { InboxItem } from '../../../src/types/index'
import type { InboxRepository } from '../repositories/InboxRepository'
import type { ProjectRepository } from '../repositories/ProjectRepository'

export class InboxService {
  constructor(
    private inboxRepo: InboxRepository,
    private projectRepo: ProjectRepository
  ) {}

  getItems(projectPath: string): InboxItem[] {
    const projectId = this.resolveId(projectPath)
    if (!projectId) return []
    return this.inboxRepo.getByProjectId(projectId)
  }

  addItem(projectPath: string, item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>): InboxItem {
    const projectId = this.resolveId(projectPath)
    if (!projectId) throw new Error(`Project not found for path: ${projectPath}`)
    return this.inboxRepo.add(projectId, item)
  }

  updateItem(projectPath: string, id: string, patch: Partial<InboxItem>): InboxItem | null {
    // projectPath unused for update since we have the item id,
    // but we keep the param for IPC contract compatibility
    void projectPath
    return this.inboxRepo.update(id, patch)
  }

  deleteItem(projectPath: string, id: string): void {
    void projectPath
    this.inboxRepo.delete(id)
  }

  private resolveId(projectPath: string): string | null {
    return this.projectRepo.resolveProjectId(projectPath)
  }
}
