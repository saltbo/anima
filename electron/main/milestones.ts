import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { InboxItem, InboxItemPriority, InboxItemStatus, Milestone, MilestoneTask } from '../../src/types/index'
import type { SetupChatData } from '../../src/types/electron.d'
import { conversationAgent, taskAgent } from './agents/service'

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

## Description
{2-3 sentence description}

## Acceptance Criteria
- {criterion 1}
- {criterion 2}

## Tasks
1. **{task title}** — {task description}
2. **{task title}** — {task description}

## Linked Inbox Items
- {inbox-item-id}
(omit this section entirely if no inbox items are linked)`

function buildFirstMessage(inboxItemIds: string[], milestoneId: string): string {
  const mdFile = `.anima/milestones/${milestoneId}.draft.md`
  return `Your task: plan a Milestone with the user, then write it to \`${mdFile}\`.

First, read these files for project context:
- ./VISION.md
- ./.anima/soul.md
- ./.anima/inbox.json${inboxItemIds.length > 0 ? `\n\nThe user has selected these inbox item IDs: ${inboxItemIds.join(', ')} — find them in inbox.json and reference them in the conversation.` : ''}

Gather these four required elements through conversation:
1. Title — action-oriented, e.g. "Ship user authentication"
2. Description — 2-3 sentences on what this milestone achieves
3. Acceptance Criteria — 3-6 specific, testable, binary criteria starting with a verb
4. Tasks — 3-10 implementation tasks in execution order; each ≈ 30-90 min of AI agent work

Conversation rules:
- Start by asking the user to describe the goal in one sentence
- One clarifying question at a time
- Reject vague criteria — each must be objectively verifiable

When the user confirms the plan, write \`${mdFile}\` in this exact format:

${MILESTONE_MD_FORMAT}`
}

function buildReviewMessage(milestoneId: string): string {
  const mdFile = `.anima/milestones/${milestoneId}.md`
  return `Review the milestone at \`${mdFile}\`.

Evaluate against four criteria:
1. **Feasibility** — Can each task realistically be completed by an AI agent in 30–90 min?
2. **Verifiability** — Is each acceptance criterion objectively testable (binary pass/fail)?
3. **Scope** — Is the milestone appropriately sized? (not a multi-month epic, not trivial)
4. **Consistency** — Do the tasks actually deliver all the acceptance criteria?

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
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Milestone[]
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
  })

  for (const iid of inboxItemIds) {
    updateInboxItem(projectPath, iid, { milestoneId, status: 'included' })
  }

  const emit = (data: SetupChatData) => win.webContents.send('setup-chat-data', id, data)

  conversationAgent.start(id, {
    projectPath,
    systemPrompt: MILESTONE_PLANNING_ROLE,
    onEvent: (event) => {
      emit(event satisfies SetupChatData)
      // When agent finishes a turn and has written the draft file, promote it.
      if (event.event === 'done' && fs.existsSync(draftPath)) {
        const mdPath = milestoneMdPath(projectPath, milestoneId)
        fs.renameSync(draftPath, mdPath)
        const milestones = getMilestones(projectPath)
        const m = milestones.find((ms) => ms.id === milestoneId)
        if (m) {
          m.status = 'reviewing'
          writeMilestonesJson(projectPath, milestones)
        }
        win.webContents.send('milestone-planning-done', id, milestoneId)
        startMilestoneReview(milestoneId, projectPath, win)
      }
    },
  })

  // Task instructions via stdin — keeps --system-prompt to one sentence.
  setTimeout(() => conversationAgent.send(id, buildFirstMessage(inboxItemIds, milestoneId)), 500)
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
  const sessionId = `${milestoneId}-review`
  let reviewResult = ''

  taskAgent.run(sessionId, {
    projectPath,
    systemPrompt: MILESTONE_REVIEW_ROLE,
    message: buildReviewMessage(milestoneId),
    onEvent: (event) => {
      win.webContents.send('setup-chat-data', sessionId, event)
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
      win.webContents.send('milestone-review-done', milestoneId)
    },
  })
}
