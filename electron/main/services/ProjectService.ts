import type { Project, ProjectView } from '../../../src/types/index'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { ProjectStateRepository } from '../repositories/ProjectStateRepository'

export class ProjectService {
  constructor(
    private projectRepo: ProjectRepository,
    private stateRepo: ProjectStateRepository
  ) {}

  list(): Project[] {
    return this.projectRepo.getAll()
  }

  listWithState(): ProjectView[] {
    const projects = this.projectRepo.getAll()
    return projects.map((p) => {
      const state = this.stateRepo.get(p.id)
      return {
        ...p,
        status: state.status,
        currentIteration: state.currentIteration,
        nextWakeTime: state.nextWakeTime,
        totalTokens: state.totalTokens,
        totalCost: state.totalCost,
        rateLimitResetAt: state.rateLimitResetAt,
      }
    })
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
}
