import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import type { Milestone, TransitionPayload } from '../../../src/types/index'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { BacklogRepository } from '../repositories/BacklogRepository'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { MilestoneItemRepository } from '../repositories/MilestoneItemRepository'
import { validateTransition } from './milestoneTransitions'
import type { SoulService } from './SoulService'

function milestoneMdPath(projectPath: string, id: string): string {
  const dir = path.join(projectPath, '.anima', 'milestones')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${id}.md`)
}

export class MilestoneService {
  private getSoulService: () => SoulService

  constructor(
    private milestoneRepo: MilestoneRepository,
    private backlogRepo: BacklogRepository,
    private milestoneItemRepo: MilestoneItemRepository,
    private projectRepo: ProjectRepository,
    private commentRepo: CommentRepository,
    private getWindow: () => BrowserWindow | null,
    getSoulService: () => SoulService
  ) {
    this.getSoulService = getSoulService
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  getMilestones(projectId: string): Milestone[] {
    return this.milestoneRepo.getByProjectId(projectId)
  }

  saveMilestone(projectId: string, milestone: Milestone): void {
    const existing = this.milestoneRepo.getById(milestone.id)
    if (existing) {
      // Preserve status — status changes must go through transition()
      this.milestoneRepo.save(projectId, { ...milestone, status: existing.status })
    } else {
      this.milestoneRepo.save(projectId, milestone)
    }

    // Sync milestone_items join table from milestone.items
    for (const item of milestone.items) {
      this.milestoneItemRepo.link(milestone.id, item.id)
    }
  }

  deleteMilestone(projectId: string, id: string): void {
    const existing = this.milestoneRepo.getById(id)
    if (existing && (existing.status === 'reviewing' || existing.status === 'in-progress')) {
      throw new Error(`Cannot delete milestone in status: ${existing.status}`)
    }
    this.milestoneRepo.delete(id)
    const projectPath = this.resolvePath(projectId)
    if (projectPath) {
      const mdPath = path.join(projectPath, '.anima', 'milestones', `${id}.md`)
      if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath)
    }
  }

  readMilestoneMarkdown(projectId: string, id: string): string | null {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return null
    const mdPath = milestoneMdPath(projectPath, id)
    if (fs.existsSync(mdPath)) return fs.readFileSync(mdPath, 'utf8')
    return null
  }

  writeMilestoneMarkdown(projectId: string, id: string, content: string): void {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return
    fs.writeFileSync(milestoneMdPath(projectPath, id), content, 'utf8')
  }

  // ── State transitions ───────────────────────────────────────────────────────

  async transition(projectId: string, milestoneId: string, payload: TransitionPayload): Promise<void> {
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`)

    const rule = validateTransition(milestone.status, payload.action)
    if (!rule) {
      throw new Error(`Invalid transition: ${milestone.status} → ${payload.action}`)
    }

    if (rule.needsScheduler) {
      await this.getSoulService().transition(projectId, milestoneId, payload)
    } else {
      this.milestoneRepo.save(projectId, { ...milestone, status: rule.to })
      this.getWindow()?.webContents.send('milestones:updated', {
        projectId,
        milestone: { ...milestone, status: rule.to },
      })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolvePath(projectId: string): string | null {
    return this.projectRepo.getById(projectId)?.path ?? null
  }
}
