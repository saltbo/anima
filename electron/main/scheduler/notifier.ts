import type { BrowserWindow } from 'electron'
import type { Milestone, Project } from '../../../src/types/index'
import type { ProjectAgentEvent, ProjectIterationStatus } from '../../../src/types/electron.d'

export class Notifier {
  constructor(
    private projectId: string,
    private getWindow: () => BrowserWindow | null
  ) {}

  private send(channel: string, data: unknown): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return
    win.webContents.send(channel, data)
  }

  broadcastStatus(project: Project): void {
    const status: ProjectIterationStatus = {
      projectId: this.projectId,
      status: project.status,
      currentIteration: project.currentIteration,
      rateLimitResetAt: project.rateLimitResetAt,
    }
    this.send('project:statusChanged', status)
  }

  broadcastAgentEvent(role: 'developer' | 'acceptor', agentKey: string): void {
    const payload: ProjectAgentEvent = { projectId: this.projectId, role, agentKey }
    this.send('project:agentEvent', payload)
  }

  broadcastMilestoneUpdate(milestone: Milestone): void {
    this.send('milestones:updated', { projectId: this.projectId, milestone })
  }

  notifyIterationPaused(milestoneId: string, reason: string): void {
    this.send('project:iterationPaused', { projectId: this.projectId, milestoneId, reason })
  }

  notifyRateLimited(resetAt: string): void {
    this.send('agent:rateLimited', { projectId: this.projectId, resetAt })
  }

  notifyMilestoneCompleted(milestoneId: string): void {
    this.send('milestones:completed', { projectId: this.projectId, milestoneId })
  }
}
