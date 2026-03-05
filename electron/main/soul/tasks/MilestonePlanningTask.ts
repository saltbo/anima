import { randomUUID } from 'crypto'
import { createLogger } from '../../logger'

import type { AgentRunner } from '../../agents/AgentRunner'
import type { ProjectRepository } from '../../repositories/ProjectRepository'
import type { MilestoneRepository } from '../../repositories/MilestoneRepository'
import type { SoulTask, Decision } from '../types'
import { Notifier } from '../notifier'
import { isRateLimitError, parseResetTime } from '../rateLimit'
import { getMcpConfigPath } from '../../mcp/mcpConfig'
import { buildPlannerSystemPrompt, buildPlannerFirstMessage } from '../prompts'

const log = createLogger('milestone-planning')

const MILESTONE_REVIEW_ROLE =
  'You are a milestone review agent. ' +
  'You may read any file in the project. ' +
  'Do not write any files or execute shell commands. ' +
  'After completing your review, you MUST post your findings as a comment via the milestones:addComment MCP tool ' +
  'with author="reviewer". Include your analysis, verdict, and specific recommendations.'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MilestonePlanningTaskOptions {
  projectId: string
  projectPath: string
  projectRepo: ProjectRepository
  milestoneRepo: MilestoneRepository
  agentRunner: AgentRunner
  notifier: Notifier
}

// ── MilestonePlanningTask ───────────────────────────────────────────────────

export class MilestonePlanningTask implements SoulTask {
  private projectId: string
  private projectPath: string
  private projectRepo: ProjectRepository
  private milestoneRepo: MilestoneRepository
  private agentRunner: AgentRunner
  private notifier: Notifier

  constructor(opts: MilestonePlanningTaskOptions) {
    this.projectId = opts.projectId
    this.projectPath = opts.projectPath
    this.projectRepo = opts.projectRepo
    this.milestoneRepo = opts.milestoneRepo
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

      const planResult = await this.agentRunner.run({
        projectPath: this.projectPath,
        sessionId: planSessionId,
        systemPrompt: buildPlannerSystemPrompt(),
        message: buildPlannerFirstMessage(this.projectId),
        mcpConfigPath,
        signal,
      })

      if (signal.aborted) return

      log.info('planning agent finished', {
        project: this.projectId,
        sessionId: planSessionId,
        model: planResult.model,
        cost: planResult.cost,
        inputTokens: planResult.usage.inputTokens,
        outputTokens: planResult.usage.outputTokens,
      })

      // Check if the agent created a milestone via MCP
      const milestones = this.milestoneRepo.getByProjectId(this.projectId)
      const draftMilestone = milestones.find(
        (m) => m.status === 'draft' && !planningDone
      )

      if (!draftMilestone) {
        log.warn('planning agent did not create a milestone', {
          project: this.projectId,
          sessionId: planSessionId,
          existingMilestones: milestones.map((m) => ({ id: m.id, status: m.status })),
        })
        return
      }

      planningDone = true
      log.info('planning agent created milestone', { milestoneId: draftMilestone.id })

      // ── Step 2: Start review ──────────────────────────────────────────
      if (signal.aborted) return

      this.milestoneRepo.save(this.projectId, { ...draftMilestone, status: 'planning' })
      this.notifier.broadcastMilestoneUpdate({ ...draftMilestone, status: 'planning' })

      await this.runReview(draftMilestone.id, signal, mcpConfigPath)

      if (signal.aborted) return

      // ── Step 3: Apply auto-approve if enabled ─────────────────────────
      const project = this.projectRepo.getById(this.projectId)
      const refreshed = this.milestoneRepo.getById(draftMilestone.id)

      if (refreshed) {
        if (project?.autoApprove) {
          this.milestoneRepo.save(this.projectId, { ...refreshed, status: 'ready' })
          this.notifier.broadcastMilestoneUpdate({ ...refreshed, status: 'ready' })
          log.info('auto-approved milestone', { milestoneId: draftMilestone.id })
        } else {
          this.milestoneRepo.save(this.projectId, { ...refreshed, status: 'planned' })
          this.notifier.broadcastMilestoneUpdate({ ...refreshed, status: 'planned' })
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
    const reviewMessage = `Review milestone \`${milestoneId}\`. Use milestones:getById to read it.

Evaluate against five criteria:
1. **Clarity** — Are the requirements clearly stated, from a product/user perspective?
2. **Unambiguity** — Is there any room for misinterpretation? Flag anything vague or open-ended.
3. **Implementability** — Can these requirements actually be built? Flag anything technically infeasible or contradictory.
4. **Verifiability** — Is each acceptance criterion binary and objectively testable?
5. **Coverage** — Do the acceptance criteria fully cover what the requirements describe?

Walk through your analysis step by step, then give a clear verdict with specific recommendations.

IMPORTANT: After completing your review, you MUST post your full analysis as a comment using the milestones:addComment tool with milestone_id="${milestoneId}" and author="reviewer".`

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
}
