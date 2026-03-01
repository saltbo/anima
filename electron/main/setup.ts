import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import type { SetupChatData } from '../../src/types/electron.d'
import { conversationAgent } from './agents/service'

export type SetupType = 'vision' | 'soul' | 'init'

// System prompts define capability boundaries only — what the agent may read/write.
// Task instructions (what to collect, conversation strategy, output format) go via stdin.
const SYSTEM_PROMPTS: Record<SetupType, string> = {
  vision:
    'You are a project Vision advisor. ' +
    'You may read any file in the project. ' +
    'You may only write to VISION.md in the project root. ' +
    'Do not write any other files or execute shell commands.',

  soul:
    'You are a project Soul advisor. ' +
    'You may read any file in the project. ' +
    'You may only write to .anima/soul.md (create .anima/ if needed). ' +
    'Do not write any other files or execute shell commands.',

  init:
    'You are a project analyst. ' +
    'You may read any file in the project. ' +
    'You may only write to VISION.md and .anima/soul.md (create .anima/ if needed). ' +
    'Do not write any other files or execute shell commands.',
}

// Detailed instructions go into the first stdin message, not into process args.
const FIRST_MESSAGES: Record<SetupType, string> = {
  vision: `Guide the user to clarify their project's Vision and produce a structured VISION.md file.

Collect these four elements (all required):
1. Identity: What is this project (one-sentence definition)
2. Problem: What problem does it solve (specific pain point)
3. Audience: Who is the target user (as specific as possible)
4. Long-term Goal: Long-term vision (what does the end state look like)

Conversation strategy:
- Ask about only one unclear element at a time
- If the user's answer is vague, ask for a concrete example
- Do not make decisions for the user; help them clarify their own thinking

When all four elements are clear, output the complete file wrapped in a markdown code block:

\`\`\`markdown
# Vision: {Project Name}

## Identity
{what the project is}

## Problem
{what problem it solves}

## Audience
{target users}

## Long-term Goal
{long-term vision}
\`\`\`

After showing the preview, ask whether the user wants to confirm writing it or continue editing.`,

  soul: `Help the user define their project's Soul — the operating principles and engineering standards that will guide all future AI agents.

Collect these five dimensions (all required):
1. Principles: The 3-5 most important operating principles (specific and actionable, not slogans)
2. Tech Preferences: Language, framework, toolchain preferences (specific versions or style requirements)
3. Red Lines: Absolute no-go zones (security constraints and non-negotiable restrictions)
4. Quality Bar: Code quality and testing requirements (lint, type checking, test coverage, etc.)
5. Iteration Style: Iteration pace (aggressive vs conservative, small steps vs big releases, always-releasable, etc.)

Conversation strategy:
- Give 1-2 examples per dimension to help the user understand the expected level of detail
- Do not accept vague answers; guide the user to provide specific content
- Soul can be brief, but every item must be a directive that an AI agent can directly follow

When all five dimensions are clear, output the complete file wrapped in a markdown code block:

\`\`\`markdown
# Soul: {Project Name}

## Principles
1. {principle one}
2. {principle two}
...

## Tech Preferences
{technology preferences}

## Red Lines
{non-negotiable constraints}

## Quality Bar
{quality standards}

## Iteration Style
{iteration pace and style}
\`\`\`

After showing the preview, ask whether the user wants to confirm writing it or continue editing.`,

  init: `Explore the project in the current working directory, then write two files using your file tools.

Steps:
1. Use tools to read the project (list files, read README, package.json, source files, configs, etc.)
2. Understand: what the project is, who it's for, what problem it solves, the tech stack, coding style
3. If the project is empty or minimal, generate sensible starter templates
4. Write VISION.md to the project root
5. Write .anima/soul.md (create the .anima directory first if needed)

VISION.md format:
# Vision: {Project Name}

## Identity
{one-sentence definition}

## Problem
{specific pain point}

## Audience
{target users}

## Long-term Goal
{end state vision}

.anima/soul.md format:
# Soul: {Project Name}

## Principles
1. {principle}
2. {principle}
3. {principle}

## Tech Preferences
{language, framework, toolchain, versions}

## Red Lines
{absolute constraints and non-negotiable rules}

## Quality Bar
{lint, type checking, test coverage requirements}

## Iteration Style
{pace, step size, release strategy}

Be specific based on evidence you find. Do not ask questions. Explore and write the files now.`,
}

export function checkProjectSetup(projectPath: string): { hasVision: boolean; hasSoul: boolean } {
  const hasVision = fs.existsSync(path.join(projectPath, 'VISION.md'))
  const hasSoul = fs.existsSync(path.join(projectPath, '.anima', 'soul.md'))
  return { hasVision, hasSoul }
}

export function startSetupSession(
  id: string,
  projectPath: string,
  type: SetupType,
  win: BrowserWindow
): void {
  conversationAgent.start(id, {
    projectPath,
    systemPrompt: SYSTEM_PROMPTS[type],
    onEvent: (event) => win.webContents.send('setup-chat-data', id, event satisfies SetupChatData),
  })
  // Detailed instructions go via stdin — keeps --system-prompt arg minimal.
  setTimeout(() => conversationAgent.send(id, FIRST_MESSAGES[type]), 500)
}

export function readSetupFiles(projectPath: string): { vision: string | null; soul: string | null } {
  const visionPath = path.join(projectPath, 'VISION.md')
  const soulPath = path.join(projectPath, '.anima', 'soul.md')
  return {
    vision: fs.existsSync(visionPath) ? fs.readFileSync(visionPath, 'utf8') : null,
    soul: fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : null,
  }
}

export function writeSetupFile(projectPath: string, type: SetupType, content: string): void {
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
