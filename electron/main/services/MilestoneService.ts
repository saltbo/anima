import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { Milestone, MilestoneTask, InboxItem } from '../../../src/types/index'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { InboxRepository } from '../repositories/InboxRepository'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { ConversationAgent, TaskAgent } from './types'

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

## Linked Inbox Items
- {inbox-item-id}
(omit this section entirely if no inbox items are linked)`

function buildFirstMessage(projectPath: string, inboxItems: InboxItem[], milestoneId: string): string {
  const mdFile = `${projectPath}/.anima/milestones/${milestoneId}.draft.md`
  const inboxContext =
    inboxItems.length > 0
      ? `\n\nThe user has pre-selected these inbox items:\n${inboxItems.map((i) => `- [${i.id}] ${i.title}: ${i.description ?? '(no description)'}`).join('\n')}`
      : ''

  return `Your role: help the user define a Milestone, then write it to \`${mdFile}\`.

First, read these files for project context:
- ${projectPath}/.anima/soul.md${inboxContext}

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
  constructor(
    private milestoneRepo: MilestoneRepository,
    private inboxRepo: InboxRepository,
    private projectRepo: ProjectRepository,
    private conversationAgent: ConversationAgent,
    private taskAgent: TaskAgent,
    private getWindow: () => BrowserWindow | null
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  getMilestones(projectId: string): Milestone[] {
    return this.milestoneRepo.getByProjectId(projectId)
  }

  saveMilestone(projectId: string, milestone: Milestone): void {
    this.milestoneRepo.save(projectId, milestone)
  }

  deleteMilestone(projectId: string, id: string): void {
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

  // ── Agent orchestration ───────────────────────────────────────────────────

  startPlanningSession(
    agentId: string,
    projectId: string,
    inboxItemIds: string[],
    title: string,
    description: string
  ): void {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return

    const milestoneId = randomUUID()
    const draftPath = milestoneDraftMdPath(projectPath, milestoneId)

    // Save milestone JSON immediately
    this.milestoneRepo.save(projectId, {
      id: milestoneId,
      title,
      description,
      status: 'draft',
      acceptanceCriteria: [],
      tasks: [],
      inboxItemIds,
      createdAt: new Date().toISOString(),
      iterationCount: 0,
      iterations: [],
    })

    // Link inbox items to milestone
    for (const iid of inboxItemIds) {
      this.inboxRepo.update(iid, { milestoneId, status: 'included' })
    }

    // Resolve inbox item contents for inline context
    const inboxItems = inboxItemIds
      .map((id) => this.inboxRepo.getById(id))
      .filter((i): i is InboxItem => i !== null)

    this.conversationAgent
      .run(agentId, {
        projectPath,
        systemPrompt: MILESTONE_PLANNING_ROLE,
        firstMessage: buildFirstMessage(projectPath, inboxItems, milestoneId),
        onEvent: (event) => {
          if (event.event === 'done' && fs.existsSync(draftPath)) {
            const mdPath = milestoneMdPath(projectPath, milestoneId)
            fs.renameSync(draftPath, mdPath)
            const m = this.milestoneRepo.getById(milestoneId)
            if (m) {
              this.milestoneRepo.save(projectId, { ...m, status: 'reviewing' })
            }
            this.getWindow()?.webContents.send('milestones:planningDone', agentId, milestoneId)
            this.startReview(milestoneId, projectId)
          }
        },
      })
      .catch(() => {
        // session ended (user closed or error) — no action needed
      })
  }

  startReview(milestoneId: string, projectId: string): void {
    const projectPath = this.resolvePath(projectId)
    if (!projectPath) return

    const agentKey = `${milestoneId}-review`
    let reviewResult = ''

    this.taskAgent.run(agentKey, {
      projectPath,
      systemPrompt: MILESTONE_REVIEW_ROLE,
      message: buildReviewMessage(projectPath, milestoneId),
      onEvent: (event) => {
        if (event.event === 'done') reviewResult = event.result ?? ''
      },
      onComplete: () => {
        const m = this.milestoneRepo.getById(milestoneId)
        if (m) {
          this.milestoneRepo.save(projectId, { ...m, status: 'reviewed', review: reviewResult })
        }
        this.getWindow()?.webContents.send('milestones:reviewDone', milestoneId)
      },
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolvePath(projectId: string): string | null {
    return this.projectRepo.getById(projectId)?.path ?? null
  }
}
