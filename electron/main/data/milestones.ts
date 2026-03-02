import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { InboxItem, InboxItemPriority, InboxItemStatus, Milestone, MilestoneTask } from '../../../src/types/index'
import { conversationAgent, taskAgent } from '../agents/service'

// Capability boundary: agent reads anything, writes only to its designated milestone file.
// The specific file path is injected per-session via the first stdin message.
const MILESTONE_PLANNING_ROLE =
  'You are a milestone planning advisor. ' +
  'You may read any file in the project. ' +
  'You may only write to the single milestone markdown file specified in your instructions. ' +
  'Do not write any other files or execute shell commands.'

const MILESTONE_REVIEW_ROLE =
  'You are a milestone review agent. ' +
  'You may read any file in the project. ' +
  'Do not write any files or execute shell commands.'

// The markdown format the agent should write. Anima only reads it for display — never parses it.
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

function buildFirstMessage(projectPath: string, inboxItemIds: string[], milestoneId: string): string {
  const mdFile = `${projectPath}/.anima/milestones/${milestoneId}.draft.md`
  return `Your role: help the user define a Milestone, then write it to \`${mdFile}\`.

First, read these files for project context:
- ${projectPath}/.anima/soul.md
- ${projectPath}/.anima/inbox.json${inboxItemIds.length > 0 ? `\n\nThe user has pre-selected these inbox item IDs: ${inboxItemIds.join(', ')} — find them in inbox.json to understand the background.` : ''}

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

function ensureAnimaDir(projectPath: string): void {
  fs.mkdirSync(path.join(projectPath, '.anima'), { recursive: true })
}

function ensureMilestonesDir(projectPath: string): string {
  const dir = path.join(projectPath, '.anima', 'milestones')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── Inbox ──────────────────────────────────────────────────────────────────

function inboxPath(projectPath: string): string {
  return path.join(projectPath, '.anima', 'inbox.json')
}

export function getInboxItems(projectPath: string): InboxItem[] {
  try {
    const p = inboxPath(projectPath)
    if (!fs.existsSync(p)) return []
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<InboxItem>[]
    return raw.map((i) => ({
      priority: 'medium' as InboxItemPriority,
      status: 'pending' as InboxItemStatus,
      ...i,
    })) as InboxItem[]
  } catch {
    return []
  }
}

function writeInboxItems(projectPath: string, items: InboxItem[]): void {
  ensureAnimaDir(projectPath)
  fs.writeFileSync(inboxPath(projectPath), JSON.stringify(items, null, 2), 'utf8')
}

export function addInboxItem(
  projectPath: string,
  item: Omit<InboxItem, 'id' | 'createdAt' | 'status'>
): InboxItem {
  const items = getInboxItems(projectPath)
  const newItem: InboxItem = {
    ...item,
    id: randomUUID(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  items.push(newItem)
  writeInboxItems(projectPath, items)
  return newItem
}

export function updateInboxItem(
  projectPath: string,
  id: string,
  patch: Partial<InboxItem>
): InboxItem | null {
  const items = getInboxItems(projectPath)
  const idx = items.findIndex((i) => i.id === id)
  if (idx === -1) return null
  items[idx] = { ...items[idx], ...patch }
  writeInboxItems(projectPath, items)
  return items[idx]
}

export function deleteInboxItem(projectPath: string, id: string): void {
  const items = getInboxItems(projectPath).filter((i) => i.id !== id)
  writeInboxItems(projectPath, items)
}

// ── Milestones ────────────────────────────────────────────────────────────

function milestonesPath(projectPath: string): string {
  return path.join(projectPath, '.anima', 'milestones.json')
}

function milestoneMdPath(projectPath: string, id: string): string {
  return path.join(ensureMilestonesDir(projectPath), `${id}.md`)
}

function milestoneDraftMdPath(projectPath: string, id: string): string {
  return path.join(ensureMilestonesDir(projectPath), `${id}.draft.md`)
}

export function getMilestones(projectPath: string): Milestone[] {
  try {
    const p = milestonesPath(projectPath)
    if (!fs.existsSync(p)) return []
    const milestones = JSON.parse(fs.readFileSync(p, 'utf8')) as Milestone[]
    // Normalize: ensure iterations array exists (backward compat)
    for (const m of milestones) {
      if (!m.iterations) m.iterations = []
    }
    return milestones
  } catch {
    return []
  }
}

function writeMilestonesJson(projectPath: string, milestones: Milestone[]): void {
  ensureAnimaDir(projectPath)
  fs.writeFileSync(milestonesPath(projectPath), JSON.stringify(milestones, null, 2), 'utf8')
}

export function saveMilestone(projectPath: string, milestone: Milestone): void {
  const milestones = getMilestones(projectPath)
  const idx = milestones.findIndex((m) => m.id === milestone.id)
  if (idx === -1) {
    milestones.push(milestone)
  } else {
    milestones.splice(idx, 1, milestone)
  }
  writeMilestonesJson(projectPath, milestones)
}

export function deleteMilestone(projectPath: string, id: string): void {
  const milestones = getMilestones(projectPath).filter((m) => m.id !== id)
  writeMilestonesJson(projectPath, milestones)
  const mdPath = path.join(projectPath, '.anima', 'milestones', `${id}.md`)
  if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath)
}

export function updateMilestoneTask(
  projectPath: string,
  milestoneId: string,
  taskId: string,
  patch: Partial<MilestoneTask>
): void {
  const milestones = getMilestones(projectPath)
  const m = milestones.find((ms) => ms.id === milestoneId)
  if (!m) return
  const tIdx = m.tasks.findIndex((t) => t.id === taskId)
  if (tIdx === -1) return
  m.tasks[tIdx] = { ...m.tasks[tIdx], ...patch }
  writeMilestonesJson(projectPath, milestones)
}

export function writeMilestoneMarkdown(projectPath: string, id: string, content: string): void {
  fs.writeFileSync(milestoneMdPath(projectPath, id), content, 'utf8')
}

// ── Agent session ─────────────────────────────────────────────────────────

export function startMilestonePlanningSession(
  id: string,
  projectPath: string,
  inboxItemIds: string[],
  title: string,
  description: string,
  win: BrowserWindow
): void {
  const milestoneId = randomUUID()
  const draftPath = milestoneDraftMdPath(projectPath, milestoneId)

  // Save JSON immediately — user already provided title & description.
  saveMilestone(projectPath, {
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

  for (const iid of inboxItemIds) {
    updateInboxItem(projectPath, iid, { milestoneId, status: 'included' })
  }

  conversationAgent
    .run(id, {
      projectPath,
      systemPrompt: MILESTONE_PLANNING_ROLE,
      firstMessage: buildFirstMessage(projectPath, inboxItemIds, milestoneId),
      onEvent: (event) => {
        // Promote draft → final when agent finishes writing it
        if (event.event === 'done' && fs.existsSync(draftPath)) {
          const mdPath = milestoneMdPath(projectPath, milestoneId)
          fs.renameSync(draftPath, mdPath)
          const milestones = getMilestones(projectPath)
          const m = milestones.find((ms) => ms.id === milestoneId)
          if (m) {
            m.status = 'reviewing'
            writeMilestonesJson(projectPath, milestones)
          }
          win.webContents.send('milestones:planningDone', id, milestoneId)
          startMilestoneReview(milestoneId, projectPath, win)
        }
      },
    })
    .catch(() => {
      // session ended (user closed or error) — no action needed
    })
}

export function readMilestoneMarkdown(projectPath: string, id: string): string | null {
  const mdPath = milestoneMdPath(projectPath, id)
  if (fs.existsSync(mdPath)) return fs.readFileSync(mdPath, 'utf8')
  const draftPath = milestoneDraftMdPath(projectPath, id)
  if (fs.existsSync(draftPath)) return fs.readFileSync(draftPath, 'utf8')
  return null
}

export function startMilestoneReview(
  milestoneId: string,
  projectPath: string,
  win: BrowserWindow
): void {
  const agentKey = `${milestoneId}-review`
  let reviewResult = ''

  taskAgent.run(agentKey, {
    projectPath,
    systemPrompt: MILESTONE_REVIEW_ROLE,
    message: buildReviewMessage(projectPath, milestoneId),
    onEvent: (event) => {
      if (event.event === 'done') reviewResult = event.result ?? ''
    },
    onComplete: () => {
      const milestones = getMilestones(projectPath)
      const m = milestones.find((ms) => ms.id === milestoneId)
      if (m) {
        m.status = 'reviewed'
        m.review = reviewResult
        writeMilestonesJson(projectPath, milestones)
      }
      win.webContents.send('milestones:reviewDone', milestoneId)
    },
  })
}
