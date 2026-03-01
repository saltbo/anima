import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { InboxItem, Milestone, MilestoneTask } from '../../src/types/index'
import type { SetupChatData } from '../../src/types/electron.d'
import { AgentSessionManager } from './agents/manager'
import { ClaudeCodeAgent } from './agents/claude-code'

const MILESTONE_PLANNING_PROMPT = `You are a milestone planning advisor for Anima. Help the user define a structured Milestone.

## Project Context
### Vision
{{VISION}}
### Soul
{{SOUL}}
### Selected Inbox Items
{{INBOX_ITEMS}}

## Collect (all required):
1. Title — action-oriented, e.g. "Ship user authentication"
2. Description — 2-3 sentences on what this milestone achieves
3. Acceptance Criteria — 3-6 specific, testable, binary criteria starting with a verb
4. Task List — 3-10 implementation tasks in execution order; each is one iteration of AI work

## Conversation strategy:
- Start: ask the user to describe the goal in one sentence
- Reference inbox items if provided, ask if this milestone addresses them
- Ask one clarifying question at a time
- Reject vague criteria — each must be objectively verifiable
- Each task ≈ 30-90 min of AI agent work; reject generic tasks like "implement feature"

## When all four elements are clear, output:
\`\`\`json
{
  "title": "...",
  "description": "...",
  "acceptanceCriteria": ["...", "..."],
  "tasks": [
    { "title": "...", "description": "..." }
  ],
  "inboxItemIds": ["id1"]
}
\`\`\`
Then ask: "Does this look right? Reply 'confirm' to save, or describe what to change."`

function ensureAnimaDir(projectPath: string): void {
  fs.mkdirSync(path.join(projectPath, '.anima'), { recursive: true })
}

// ── Inbox ──────────────────────────────────────────────────────────────────

function inboxPath(projectPath: string): string {
  return path.join(projectPath, '.anima', 'inbox.json')
}

export function getInboxItems(projectPath: string): InboxItem[] {
  try {
    const p = inboxPath(projectPath)
    if (!fs.existsSync(p)) return []
    return JSON.parse(fs.readFileSync(p, 'utf8')) as InboxItem[]
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
  item: Omit<InboxItem, 'id' | 'createdAt'>
): InboxItem {
  const items = getInboxItems(projectPath)
  const newItem: InboxItem = { ...item, id: randomUUID(), createdAt: new Date().toISOString() }
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

export function getMilestones(projectPath: string): Milestone[] {
  try {
    const p = milestonesPath(projectPath)
    if (!fs.existsSync(p)) return []
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Milestone[]
  } catch {
    return []
  }
}

function writeMilestones(projectPath: string, milestones: Milestone[]): void {
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
  writeMilestones(projectPath, milestones)
}

export function deleteMilestone(projectPath: string, id: string): void {
  const milestones = getMilestones(projectPath).filter((m) => m.id !== id)
  writeMilestones(projectPath, milestones)
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
  writeMilestones(projectPath, milestones)
}

// ── Agent session ─────────────────────────────────────────────────────────

const manager = new AgentSessionManager()
const claudeAgent = new ClaudeCodeAgent()

export function startMilestonePlanningSession(
  id: string,
  projectPath: string,
  inboxItemIds: string[],
  win: BrowserWindow
): void {
  let vision = ''
  let soul = ''
  try { vision = fs.readFileSync(path.join(projectPath, 'VISION.md'), 'utf8') } catch { /* empty */ }
  try { soul = fs.readFileSync(path.join(projectPath, '.anima', 'soul.md'), 'utf8') } catch { /* empty */ }

  const selectedItems = getInboxItems(projectPath).filter((i) => inboxItemIds.includes(i.id))
  const inboxText = selectedItems.length > 0
    ? selectedItems.map((i) => `- [${i.type}] ${i.title}${i.description ? ': ' + i.description : ''}`).join('\n')
    : '(none selected)'

  const systemPrompt = MILESTONE_PLANNING_PROMPT
    .replace('{{VISION}}', vision || '(not set)')
    .replace('{{SOUL}}', soul || '(not set)')
    .replace('{{INBOX_ITEMS}}', inboxText)

  manager.start(id, claudeAgent, {
    projectPath,
    systemPrompt,
    onEvent: (event) => win.webContents.send('setup-chat-data', id, event satisfies SetupChatData),
  })
}
