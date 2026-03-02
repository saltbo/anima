import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { ConversationAgent } from './types'

export type SetupType = 'init'

export interface SoulTemplate {
  id: string
  name: string
  description: string
  content: string
}

const TEMPLATE_META: Omit<SoulTemplate, 'content'>[] = [
  { id: 'go', name: 'Go', description: 'Go 1.21+ · Effective Go · standard layout' },
  { id: 'typescript-react', name: 'TypeScript + React', description: 'Vite · React 18 · TypeScript strict' },
  { id: 'python', name: 'Python', description: 'Python 3.11+ · ruff · mypy strict · pytest' },
]

function getTemplatesDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'soul-templates')
  }
  return path.join(app.getAppPath(), 'resources', 'soul-templates')
}

const SOUL_SYSTEM_PROMPT =
  'You are a project analyst giving a software project its soul — a first-person engineering identity document. ' +
  'CRITICAL RULE: You must ONLY read files inside the current working directory (cwd). ' +
  'NEVER use `cd`, `../`, or absolute paths to access anything outside the project root. ' +
  'All file paths you read MUST be relative paths that stay within cwd. ' +
  'You may only write to one file: .anima/soul.md (create .anima/ if needed). ' +
  'Do not write any other files. Do not run shell commands that leave the project directory.'

const SYSTEM_PROMPT =
  'You are a project analyst. ' +
  'CRITICAL RULE: You must ONLY read and write files inside the current working directory (cwd). ' +
  'NEVER use `cd`, `../`, or absolute paths to access anything outside the project root. ' +
  'All file paths you read or write MUST be relative paths that stay within cwd. ' +
  'You may only write to two files: VISION.md and .anima/soul.md (create .anima/ if needed). ' +
  'Do not write any other files. Do not run shell commands that leave the project directory.'

const FIRST_MESSAGE = `Read the project in the current working directory, then write two short context files.

IMPORTANT: All file operations must stay within the current directory. Never use \`cd\`, \`../\`,
or absolute paths. Only use relative paths like \`./src/...\`, \`package.json\`, etc.

---

VISION.md — product positioning, one page or less.

This file will be read by AI agents to decide whether an incoming feature request or user
feedback fits the project. It is a decision filter, not a design document.
Keep it short. Every sentence should help an agent answer "should we build this?".
Cover: what this is, who it is for, what is explicitly in and out of scope, where it is headed.

soul.md — engineering rulebook, one page or less.

This file will be prepended to an AI agent's context every time it writes code for this project.
It must be short enough to read in under a minute.
Cover: non-negotiable engineering principles, tech stack choices, key conventions, red lines.
Write directives, not descriptions. Bad: "We value simplicity." Good: "One component per file. No default exports."

DO NOT include in either file: milestone plans, task lists, implementation roadmaps, or project specifications.
Those belong elsewhere. These files are permanent context, not planning documents.

For anything you cannot determine from the project files, write \`[TODO: <brief note>]\`.

---

Steps:
1. List files, read README, package.json, config files, and a few source files.
2. Write VISION.md to the project root.
3. Write .anima/soul.md (create .anima/ first if needed).

Do not ask questions. Write the files now.`

export class SetupService {
  constructor(private conversationAgent: ConversationAgent) {}

  listSoulTemplates(): SoulTemplate[] {
    const dir = getTemplatesDir()
    return TEMPLATE_META.map((meta) => {
      const filePath = path.join(dir, `${meta.id}.md`)
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
      return { ...meta, content }
    })
  }

  applySoulTemplate(projectPath: string, templateId: string): void {
    const template = this.listSoulTemplates().find((t) => t.id === templateId)
    if (!template?.content) throw new Error(`Soul template not found: ${templateId}`)
    this.writeSetupFile(projectPath, 'soul', template.content)
  }

  startSoulSession(id: string, projectPath: string, templateId: string): void {
    const template = this.listSoulTemplates().find((t) => t.id === templateId)
    if (!template?.content) throw new Error(`Soul template not found: ${templateId}`)

    const firstMessage = `You are giving this project its soul.

A soul.md is a first-person character document — the project speaking about itself as an engineer.
It is short (one page or less), opinionated, and written in first-person voice.
It will be prepended to an AI agent's context every time it writes code for this project.

You have been given a base soul template for this project's tech stack. Your job is to:
1. Read the project (README, config files, source files) to understand its specific conventions, patterns, and decisions.
2. Start from the template below and ENRICH it with project-specific knowledge.
   - Keep the sections and first-person voice.
   - Replace generic statements with project-specific ones where you find evidence.
   - Add project-specific conventions you discover (naming patterns, folder layout, key libraries used, etc.).
   - Leave \`[TODO: <brief note>]\` for anything you cannot determine.
3. Write the result to .anima/soul.md (create .anima/ if needed).

IMPORTANT: Only use relative paths. Never use \`cd\`, \`../\`, or absolute paths.
DO NOT include milestone plans, task lists, or implementation roadmaps.
Keep it one page or less — short enough to read in under a minute.

---

BASE TEMPLATE:

${template.content}

---

Now read the project and enrich this soul with project-specific knowledge. Write .anima/soul.md when done.`

    this.conversationAgent
      .run(id, {
        projectPath,
        systemPrompt: SOUL_SYSTEM_PROMPT,
        firstMessage,
      })
      .catch(() => {
        // session ended (user closed or error) — no action needed
      })
  }

  checkProjectSetup(projectPath: string): { hasVision: boolean; hasSoul: boolean } {
    const hasVision = fs.existsSync(path.join(projectPath, 'VISION.md'))
    const hasSoul = fs.existsSync(path.join(projectPath, '.anima', 'soul.md'))
    return { hasVision, hasSoul }
  }

  startSetupSession(id: string, projectPath: string, _type: SetupType, userContext?: string): void {
    let message = FIRST_MESSAGE
    if (userContext) {
      message += `\n\nThe user has provided the following context about their project. Prioritize this information over guesses when generating the documents:\n\n${userContext}`
    }
    this.conversationAgent
      .run(id, {
        projectPath,
        systemPrompt: SYSTEM_PROMPT,
        firstMessage: message,
      })
      .catch(() => {
        // session ended (user closed or error) — no action needed
      })
  }

  readSetupFiles(projectPath: string): { vision: string | null; soul: string | null } {
    const visionPath = path.join(projectPath, 'VISION.md')
    const soulPath = path.join(projectPath, '.anima', 'soul.md')
    return {
      vision: fs.existsSync(visionPath) ? fs.readFileSync(visionPath, 'utf8') : null,
      soul: fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : null,
    }
  }

  writeSetupFile(projectPath: string, type: 'vision' | 'soul', content: string): void {
    if (type === 'vision') {
      fs.writeFileSync(path.join(projectPath, 'VISION.md'), content, 'utf8')
    } else {
      const animaDir = path.join(projectPath, '.anima')
      if (!fs.existsSync(animaDir)) {
        fs.mkdirSync(animaDir, { recursive: true })
      }
      fs.writeFileSync(path.join(animaDir, 'soul.md'), content, 'utf8')
    }
  }
}
