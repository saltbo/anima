import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { Milestone, TransitionPayload } from '../../../src/types/index'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { BacklogRepository } from '../repositories/BacklogRepository'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { CheckRepository } from '../repositories/CheckRepository'
import type { MilestoneItemRepository } from '../repositories/MilestoneItemRepository'
import { validateTransition } from './milestoneTransitions'
import { nowISO } from '../lib/time'
import { getAllAgents } from '../agents/registry'
import type { SoulService } from './SoulService'

export interface CreateMilestoneInput {
  title: string
  description: string
  backlogItems: Array<{
    id: string
    checks: Array<{
      title: string
      description?: string
    }>
  }>
}

export class MilestoneService {
  private getSoulService: () => SoulService

  constructor(
    private milestoneRepo: MilestoneRepository,
    private backlogRepo: BacklogRepository,
    private milestoneItemRepo: MilestoneItemRepository,
    private projectRepo: ProjectRepository,
    private commentRepo: CommentRepository,
    private checkRepo: CheckRepository,
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
    if (existing && (existing.status === 'planning' || existing.status === 'in_progress')) {
      throw new Error(`Cannot delete milestone in status: ${existing.status}`)
    }
    this.milestoneRepo.delete(id)
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

      // Release backlog items back to todo when milestone is cancelled or closed
      if (rule.to === 'cancelled' || rule.to === 'closed') {
        this.releaseBacklogItems(milestoneId)
      }

      this.getWindow()?.webContents.send('milestones:updated', {
        projectId,
        milestone: { ...milestone, status: rule.to },
      })
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  createMilestone(projectId: string, input: CreateMilestoneInput): { milestoneId: string; linkedBacklogItems: number; checks: number } {
    const milestoneId = randomUUID()
    const now = nowISO()

    // Save milestone record
    this.milestoneRepo.save(projectId, {
      id: milestoneId,
      title: input.title,
      description: input.description,
      status: 'draft',
      items: [],
      checks: [],
      createdAt: now,
      iterationCount: 0,
      iterations: [],
      totalTokens: 0,
      totalCost: 0,
      assignees: getAllAgents().map((a) => a.id),
    })

    // Link backlog items, update their status, and create checks
    let totalChecks = 0
    for (const item of input.backlogItems) {
      this.milestoneItemRepo.link(milestoneId, item.id)
      this.backlogRepo.update(item.id, { status: 'in_progress' })

      for (const check of item.checks) {
        this.checkRepo.add({
          milestoneId,
          itemId: item.id,
          title: check.title,
          description: check.description,
          status: 'pending',
          iteration: 0,
        })
        totalChecks++
      }
    }

    return { milestoneId, linkedBacklogItems: input.backlogItems.length, checks: totalChecks }
  }

  // ── Agent assignment ──────────────────────────────────────────────────────

  assignAgent(milestoneId: string, agentId: string): void {
    const milestone = this.milestoneRepo.getById(milestoneId)
    if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`)

    const assignees = milestone.assignees ?? []
    if (!assignees.includes(agentId)) {
      assignees.push(agentId)
    }

    const projectId = this.milestoneRepo.getProjectIdForMilestone(milestoneId)
    if (!projectId) throw new Error(`Project not found for milestone: ${milestoneId}`)

    this.milestoneRepo.save(projectId, { ...milestone, assignees })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private releaseBacklogItems(milestoneId: string): void {
    const itemIds = this.milestoneItemRepo.getItemIds(milestoneId)
    for (const itemId of itemIds) {
      this.backlogRepo.update(itemId, { status: 'todo' })
    }
  }

}
