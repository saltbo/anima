import type { Project } from '../../../src/types/index'
import type { ProjectRepository } from '../repositories/ProjectRepository'

export class ProjectService {
  constructor(private projectRepo: ProjectRepository) {}

  list(): Project[] {
    return this.projectRepo.getAll()
  }

  add(projectPath: string): Project {
    return this.projectRepo.add(projectPath)
  }

  remove(id: string): void {
    this.projectRepo.remove(id)
  }

  getByPath(projectPath: string): Project | null {
    return this.projectRepo.getByPath(projectPath)
  }

  patch(id: string, patch: Partial<Pick<Project, 'autoMerge' | 'autoApprove'>>): Project {
    return this.projectRepo.patch(id, patch)
  }
}
