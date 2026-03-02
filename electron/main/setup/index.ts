import * as fs from 'fs'
import * as path from 'path'
import { conversationAgent } from '../agents/service'

export type SetupType = 'init'

const SYSTEM_PROMPT =
  'You are a project analyst. ' +
  'CRITICAL RULE: You must ONLY read and write files inside the current working directory (cwd). ' +
  'NEVER use `cd`, `../`, or absolute paths to access anything outside the project root. ' +
  'All file paths you read or write MUST be relative paths that stay within cwd. ' +
  'You may only write to two files: VISION.md and .anima/soul.md (create .anima/ if needed). ' +
  'Do not write any other files. Do not run shell commands that leave the project directory.'

const FIRST_MESSAGE = `Analyze the project in the current working directory and write two files.

IMPORTANT: All file operations must stay within the current directory. Never use \`cd\`, \`../\`,
or absolute paths. Only use relative paths like \`./src/...\`, \`package.json\`, etc.

Steps:
1. List files in the current directory and read key project files (README, package.json, config files, a few source files)
2. Understand: what the project is, who it's for, what problem it solves, the tech stack, coding style
3. Write VISION.md to the project root
4. Write .anima/soul.md (create the .anima directory first if needed)

For anything you cannot confidently determine from the project files, do NOT guess or leave it blank.
Instead, write a placeholder like \`[TODO: describe what information is needed]\` with a brief note
explaining what the user should fill in and why.

VISION.md format:
# Vision: {Project Name}

## Identity
{one-sentence definition of what the project is}

## Problem
{specific pain point it solves}

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

Be specific based on evidence you find. Do not ask questions. Explore and write the files now.`

export function checkProjectSetup(projectPath: string): { hasVision: boolean; hasSoul: boolean } {
  const hasVision = fs.existsSync(path.join(projectPath, 'VISION.md'))
  const hasSoul = fs.existsSync(path.join(projectPath, '.anima', 'soul.md'))
  return { hasVision, hasSoul }
}

export function startSetupSession(id: string, projectPath: string, _type: SetupType, userContext?: string): void {
  let message = FIRST_MESSAGE
  if (userContext) {
    message += `\n\nThe user has provided the following context about their project. Prioritize this information over guesses when generating the documents:\n\n${userContext}`
  }
  conversationAgent
    .run(id, {
      projectPath,
      systemPrompt: SYSTEM_PROMPT,
      firstMessage: message,
    })
    .catch(() => {
      // session ended (user closed or error) — no action needed
    })
}

export function readSetupFiles(projectPath: string): { vision: string | null; soul: string | null } {
  const visionPath = path.join(projectPath, 'VISION.md')
  const soulPath = path.join(projectPath, '.anima', 'soul.md')
  return {
    vision: fs.existsSync(visionPath) ? fs.readFileSync(visionPath, 'utf8') : null,
    soul: fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : null,
  }
}

export function writeSetupFile(projectPath: string, type: 'vision' | 'soul', content: string): void {
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
