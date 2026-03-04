import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { createLogger } from '../../logger'

import type { AgentRunner } from '../../agents/AgentRunner'
import type { ProjectRepository } from '../../repositories/ProjectRepository'
import type { MilestoneRepository } from '../../repositories/MilestoneRepository'
import type { BacklogRepository } from '../../repositories/BacklogRepository'
import type { MilestoneItemRepository } from '../../repositories/MilestoneItemRepository'
import type { SoulTask, Decision } from '../types'
import { Notifier } from '../notifier'
import { isRateLimitError, parseResetTime } from '../rateLimit'
import { getMcpConfigPath } from '../../mcp/mcpConfig'
import { buildPlannerSystemPrompt, buildPlannerFirstMessage } from '../prompts'

const log = createLogger('milestone-planning')

const MILESTONE_REVIEW_ROLE =
  'You are a milestone review agent. ' +
  'You may read any file in the project. ' +
  'Do not write any files or execute shell commands.'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MilestonePlanningTaskOptions {
  projectId: string
  projectPath: string
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  backlogRepo: BacklogRepository
  milestoneItemRepo: MilestoneItemRepository
  agentRunner: AgentRunner
  notifier: Notifier
}

// ── MilestonePlanningTask ───────────────────────────────────────────────────

export class MilestonePlanningTask implements SoulTask {
  private projectId: string
  private projectPath: string
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private backlogRepo: BacklogRepository
  private milestoneItemRepo: MilestoneItemRepository
  private agentRunner: AgentRunner
  private notifier: Notifier

  constructor(opts: MilestonePlanningTaskOptions) {
    this.projectId = opts.projectId
    this.projectPath = opts.projectPath
    this.projectRepo = opts.projectRepo
    this.milestoneRepo = opts.milestoneRepo
    this.backlogRepo = opts.backlogRepo
    this.milestoneItemRepo = opts.milestoneItemRepo
    this.agentRunner = opts.agentRunner
    this.notifier = opts.notifier
  }

  async execute(_decision: Decision, signal: AbortSignal): Promise<void> {
    log.info('starting milestone planning', { project: this.projectId })

    const mcpConfigPath = getMcpConfigPath()

    try {
      // ── Step 1: Run planning agent ──────────────────────────────────────
      const planSessionId = randomUUID()
      let planningDone = false

      await this.agentRunner.run({
        projectPath: this.projectPath,
        sessionId: planSessionId,
        systemPrompt: buildPlannerSystemPrompt(),
        message: buildPlannerFirstMessage(this.projectId),
        mcpConfigPath,
        signal,
      })

      if (signal.aborted) return

      // Check if the agent created a milestone via MCP
      const milestones = this.milestoneRepo.getByProjectId(this.projectId)
      const draftMilestone = milestones.find(
        (m) => m.status === 'draft' && !planningDone
      )

      if (!draftMilestone) {
        log.warn('planning agent did not create a milestone', { project: this.projectId })
        return
      }

      planningDone = true
      log.info('planning agent created milestone', { milestoneId: draftMilestone.id })

      // ── Step 2: Write milestone markdown file ─────────────────────────
      this.writeMilestoneMarkdown(draftMilestone.id, draftMilestone.title, draftMilestone.description)

      // ── Step 3: Start review ──────────────────────────────────────────
      if (signal.aborted) return

      this.milestoneRepo.save(this.projectId, { ...draftMilestone, status: 'reviewing' })
      this.notifier.broadcastMilestoneUpdate({ ...draftMilestone, status: 'reviewing' })

      await this.runReview(draftMilestone.id, signal, mcpConfigPath)

      if (signal.aborted) return

      // ── Step 4: Apply auto-approve if enabled ─────────────────────────
      const project = this.projectRepo.getById(this.projectId)
      const refreshed = this.milestoneRepo.getById(draftMilestone.id)

      if (refreshed) {
        if (project?.autoApprove) {
          this.milestoneRepo.save(this.projectId, { ...refreshed, status: 'ready' })
          this.notifier.broadcastMilestoneUpdate({ ...refreshed, status: 'ready' })
          log.info('auto-approved milestone', { milestoneId: draftMilestone.id })
        } else {
          this.milestoneRepo.save(this.projectId, { ...refreshed, status: 'reviewed' })
          this.notifier.broadcastMilestoneUpdate({ ...refreshed, status: 'reviewed' })
          log.info('milestone reviewed, awaiting user approval', { milestoneId: draftMilestone.id })
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)

      if (isRateLimitError(msg)) {
        const resetAt = parseResetTime(msg)
        log.warn('rate limit during planning', { resetAt })
        this.projectRepo.patch(this.projectId, { status: 'rate_limited', rateLimitResetAt: resetAt })
        this.notifier.notifyRateLimited(resetAt)
        return
      }

      log.error('planning error', { error: msg })
    }
  }

  private async runReview(milestoneId: string, signal: AbortSignal, mcpConfigPath: string): Promise<void> {
    const mdFile = `${this.projectPath}/.anima/milestones/${milestoneId}.md`

    const reviewMessage = `Review the milestone at \`${mdFile}\`.

Evaluate against five criteria:
1. **Clarity** — Are the requirements clearly stated, from a product/user perspective?
2. **Unambiguity** — Is there any room for misinterpretation? Flag anything vague or open-ended.
3. **Implementability** — Can these requirements actually be built? Flag anything technically infeasible or contradictory.
4. **Verifiability** — Is each acceptance criterion binary and objectively testable?
5. **Coverage** — Do the acceptance criteria fully cover what the requirements describe?

Walk through your analysis step by step, then give a clear verdict with specific recommendations.`

    try {
      const sessionId = randomUUID()
      await this.agentRunner.run({
        projectPath: this.projectPath,
        sessionId,
        systemPrompt: MILESTONE_REVIEW_ROLE,
        message: reviewMessage,
        mcpConfigPath,
        signal,
      })
    } catch {
      // review session ended
    }
  }

  private writeMilestoneMarkdown(milestoneId: string, title: string, description: string): void {
    const dir = path.join(this.projectPath, '.anima', 'milestones')
    fs.mkdirSync(dir, { recursive: true })
    const mdPath = path.join(dir, `${milestoneId}.md`)

    // Get linked backlog items for the markdown content
    const itemIds = this.milestoneItemRepo.getItemIds(milestoneId)
    const backlogItems = itemIds
      .map((id) => this.backlogRepo.getById(id))
      .filter((i) => i !== null)
    const backlogSection = backlogItems.length > 0
      ? `\n## Linked Backlog Items\n${backlogItems.map((i) => `- ${i.id}: ${i.title}`).join('\n')}`
      : ''

    const content = `# ${title}\n\n## Requirements\n${description}${backlogSection}\n`
    fs.writeFileSync(mdPath, content, 'utf8')
  }
}
