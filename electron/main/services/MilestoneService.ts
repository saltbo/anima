import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { nowISO } from '../lib/time'
import type { Milestone, MilestoneTask, BacklogItem, TransitionPayload } from '../../../src/types/index'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { BacklogRepository } from '../repositories/BacklogRepository'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { AgentRunner } from '../agents/AgentRunner'
import { validateTransition } from './milestoneTransitions'
import type { SoulService } from './SoulService'

// Capability boundary: agent reads anything, writes only to its designated milestone file.
const MILESTONE_PLANNING_ROLE =
  'You are a milestone planning advisor. ' +
  'You may read any file in the project. ' +
  'You may only write to the single milestone markdown file specified in your instructions. ' +
  'Do not write any other files or execute shell commands.'

const MILESTONE_REVIEW_ROLE =
  'You are a milestone review agent. ' +
  'You may read any file in the project. ' +
  'Do not write any files or execute shell commands.'

const MILESTONE_MD_FORMAT = `\
# {title}

## Requirements
{describe each feature or bug from a product perspective — what the user experiences, not how it is implemented}
{one paragraph or bullet per item}

## Acceptance Criteria
- {criterion 1 — observable, binary, product-level}
- {criterion 2}

## Linked Backlog Items
- {backlog-item-id}
(omit this section entirely if no backlog items are linked)`

function buildFirstMessage(projectPath: string, backlogItems: BacklogItem[], milestoneId: string): string {
  const mdFile = `${projectPath}/.anima/milestones/${milestoneId}.draft.md`
  const backlogContext =
    backlogItems.length > 0
      ? `\n\nThe user has pre-selected these backlog items:\n${backlogItems.map((i) => `- [${i.id}] ${i.title}: ${i.description ?? '(no description)'}`).join('\n')}`
      : ''

  return `Your role: help the user define a Milestone, then write it to \`${mdFile}\`.

First, read these files for project context:
- ${projectPath}/.anima/soul.md${backlogContext}

A Milestone is a product-level requirement document — not a technical plan.
- Requirements describe features or bugs from the user's perspective: what they see, what they can do, what breaks. Never say how to implement it.
- Acceptance Criteria are product-level: observable, binary conditions that confirm the requirement is met. Generate these yourself based on what the user describes.

Conversation rules:
- Let the user describe their requirements and/or bugs freely
- Ask at most one clarifying question if something is genuinely unclear
- Do NOT ask about implementation, tasks, or technical approach
- Once you have enough to write clear AC, propose the milestone for confirmation
- Adjust if the user gives feedback, then write the file

When the user confirms, write \`${mdFile}\` in this exact format:

${MILESTONE_MD_FORMAT}`
}

function buildReviewMessage(projectPath: string, milestoneId: string): string {
  const mdFile = `${projectPath}/.anima/milestones/${milestoneId}.md`
  return `Review the milestone at \`${mdFile}\`.

Evaluate against five criteria:
1. **Clarity** — Are the requirements clearly stated, from a product/user perspective?
2. **Unambiguity** — Is there any room for misinterpretation? Flag anything vague or open-ended.
3. **Implementability** — Can these requirements actually be built? Flag anything technically infeasible or contradictory.
4. **Verifiability** — Is each acceptance criterion binary and objectively testable?
5. **Coverage** — Do the acceptance criteria fully cover what the requirements describe?

Walk through your analysis step by step, then give a clear verdict with specific recommendations.`
}

function ensureMilestonesDir(projectPath: string): string {
  const dir = path.join(projectPath, '.anima', 'milestones')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function milestoneMdPath(projectPath: string, id: string): string {
  return path.join(ensureMilestonesDir(projectPath), `${id}.md`)
}

function milestoneDraftMdPath(projectPath: string, id: string): string {
  return path.join(ensureMilestonesDir(projectPath), `${id}.draft.md`)
}

export class MilestoneService {
  private getSoulService: () => SoulService

  constructor(
    private milestoneRepo: MilestoneRepository,
    private backlogRepo: BacklogRepository,
    private projectRepo: ProjectRepository,
    private commentRepo: CommentRepository,
    private agentRunner: AgentRunner,
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

  updateMilestoneTask(milestoneId: string, taskId: string, patch: Partial<MilestoneTask>): void {
    this.milestoneRepo.updateTask(milestoneId, taskId, patch)
  }

  readMilestoneMarkdown(projectId: string, id: string): string | null {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return null
    const mdPath = milestoneMdPath(projectPath, id)
    if (fs.existsSync(mdPath)) return fs.readFileSync(mdPath, 'utf8')
    const draftPath = milestoneDraftMdPath(projectPath, id)
    if (fs.existsSync(draftPath)) return fs.readFileSync(draftPath, 'utf8')
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

  // ── Agent orchestration ───────────────────────────────────────────────────

  /** Track active planning sessions: sessionId → { projectId, milestoneId, agentId } */
  private planningSessions = new Map<string, { projectId: string; milestoneId: string; agentId: string }>()
  /** Queue of pending resume messages per sessionId — ensures sequential execution. */
  private resumeQueues = new Map<string, Array<{ projectPath: string; message: string }>>()

  private makePlanningDoneHandler(sessionId: string) {
    return (event: { event: string }): void => {
      const session = this.planningSessions.get(sessionId)
      if (!session || event.event !== 'done') return

      const projectPath = this.resolvePath(session.projectId)
      if (!projectPath) return

      const draftPath = milestoneDraftMdPath(projectPath, session.milestoneId)
      if (!fs.existsSync(draftPath)) return

      // Draft file exists — planning is complete
      this.planningSessions.delete(sessionId)
      const mdPath = milestoneMdPath(projectPath, session.milestoneId)
      fs.renameSync(draftPath, mdPath)
      const m = this.milestoneRepo.getById(session.milestoneId)
      if (m) {
        this.milestoneRepo.save(session.projectId, { ...m, status: 'reviewing' })
      }
      this.getWindow()?.webContents.send('milestones:planningDone', session.agentId, session.milestoneId)
      this.startReview(session.milestoneId, session.projectId)
    }
  }

  async startPlanningSession(
    agentId: string,
    projectId: string,
    backlogItemIds: string[],
    title: string,
    description: string
  ): Promise<{ sessionId: string; milestoneId: string }> {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return { sessionId: '', milestoneId: '' }

    const milestoneId = randomUUID()
    const sessionId = randomUUID()

    // Save milestone JSON immediately
    this.milestoneRepo.save(projectId, {
      id: milestoneId,
      title,
      description,
      status: 'draft',
      acceptanceCriteria: [],
      tasks: [],
      createdAt: nowISO(),
      iterationCount: 0,
      iterations: [],
    })

    // Link backlog items to milestone
    for (const iid of backlogItemIds) {
      this.backlogRepo.update(iid, { milestoneId, status: 'in_progress' })
    }

    // Resolve backlog item contents for inline context
    const backlogItems = backlogItemIds
      .map((id) => this.backlogRepo.getById(id))
      .filter((i): i is BacklogItem => i !== null)

    // Register planning session for resume tracking
    this.planningSessions.set(sessionId, { projectId, milestoneId, agentId })

    // Mark session as busy so resume calls queue behind the initial run
    this.resumeQueues.set(sessionId, [])

    // Fire-and-forget: run agent in background
    this.agentRunner.run({
      projectPath,
      sessionId,
      systemPrompt: MILESTONE_PLANNING_ROLE,
      message: buildFirstMessage(projectPath, backlogItems, milestoneId),
      onEvent: this.makePlanningDoneHandler(sessionId),
    }).catch(() => {
      // session ended (user closed or error) — no action needed
    }).finally(() => {
      // Drain any queued resume messages, or clear the queue
      const queue = this.resumeQueues.get(sessionId)
      if (queue && queue.length > 0) {
        const next = queue.shift()!
        this.drainResumeQueue(sessionId, next.projectPath, next.message)
      } else {
        this.resumeQueues.delete(sessionId)
      }
    })

    return { sessionId, milestoneId }
  }

  /** Resume an active planning session with a follow-up user message (fire-and-forget with queue). */
  resumePlanningSession(projectId: string, sessionId: string, message: string): void {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return

    const queue = this.resumeQueues.get(sessionId)
    if (queue) {
      // Already processing — enqueue
      queue.push({ projectPath, message })
      return
    }

    // Start processing
    this.resumeQueues.set(sessionId, [])
    this.drainResumeQueue(sessionId, projectPath, message)
  }

  private async drainResumeQueue(sessionId: string, projectPath: string, message: string): Promise<void> {
    try {
      await this.agentRunner.resume({
        projectPath,
        sessionId,
        message,
        onEvent: this.makePlanningDoneHandler(sessionId),
      })
    } catch {
      // agent errored — continue draining
    }

    // Process next queued message
    const queue = this.resumeQueues.get(sessionId)
    if (queue && queue.length > 0) {
      const next = queue.shift()!
      this.drainResumeQueue(sessionId, next.projectPath, next.message)
    } else {
      this.resumeQueues.delete(sessionId)
    }
  }

  async startReview(milestoneId: string, projectId: string): Promise<void> {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return

    let reviewResult = ''

    try {
      const sessionId = randomUUID()
      await this.agentRunner.run({
        projectPath,
        sessionId,
        systemPrompt: MILESTONE_REVIEW_ROLE,
        message: buildReviewMessage(projectPath, milestoneId),
        onEvent: (event) => {
          if (event.event === 'done') reviewResult = event.result ?? ''
        },
      })
    } catch {
      // session ended — no action needed
    }

    const m = this.milestoneRepo.getById(milestoneId)
    if (m) {
      this.milestoneRepo.save(projectId, { ...m, status: 'reviewed' })
    }
    if (reviewResult) {
      const now = nowISO()
      this.commentRepo.add({
        id: randomUUID(),
        milestoneId,
        body: reviewResult,
        author: 'system',
        createdAt: now,
        updatedAt: now,
      })
    }
    this.getWindow()?.webContents.send('milestones:reviewDone', milestoneId)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolvePath(projectId: string): string | null {
    return this.projectRepo.getById(projectId)?.path ?? null
  }
}
