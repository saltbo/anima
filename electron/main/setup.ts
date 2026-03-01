import { spawn, execSync, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { BrowserWindow } from 'electron'

export type SetupType = 'vision' | 'soul' | 'init'

export type SetupChatData =
  | { event: 'text'; text: string }
  | { event: 'thinking'; thinking: string }
  | { event: 'tool_use'; toolName: string; toolInput: string; toolCallId: string }
  | { event: 'tool_result'; toolCallId: string; content: string; isError: boolean }
  | { event: 'system'; model: string; sessionId: string }
  | { event: 'rate_limit'; utilization: number }
  | { event: 'done'; result?: string }
  | { event: 'error'; message: string }

const VISION_PROMPT = `You are a project Vision advisor. Guide the user to clarify their project's Vision and produce a structured VISION.md file.

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

After showing the preview, ask whether the user wants to confirm writing it or continue editing.`

const SOUL_PROMPT = `You are a project principles advisor. Help the user define their project's Soul — the operating principles and engineering standards. Soul will serve as the behavioral guidelines for all future AI agents.

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

After showing the preview, ask whether the user wants to confirm writing it or continue editing.`

const INIT_PROMPT = `You are a project analyst for Anima, an autonomous AI project manager.

Your task: explore the project in the current working directory, then write two files directly using your file writing tools.

Process:
1. Use tools to explore the project (list files, read README, package.json, source files, configs, etc.)
2. Understand: what the project is, who it's for, what problem it solves, the tech stack, coding style
3. If the project is empty or minimal, generate sensible starter templates
4. Write VISION.md to the project root
5. Write .anima/soul.md (create the .anima directory first if it does not exist)

VISION.md content format:
# Vision: {Project Name}

## Identity
{one-sentence definition}

## Problem
{specific pain point}

## Audience
{target users}

## Long-term Goal
{end state vision}

.anima/soul.md content format:
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

Be specific based on evidence you find. Do not ask questions. Just explore and write the files.`

function resolveCliPath(command: string): string | null {
  const homeDir = os.homedir()
  const candidates = [
    path.join(homeDir, '.local', 'bin', command),
    path.join(homeDir, '.volta', 'bin', command),
    path.join(homeDir, '.npm', 'bin', command),
    path.join('/usr', 'local', 'bin', command),
    path.join('/opt', 'homebrew', 'bin', command),
    path.join('/usr', 'bin', command),
    path.join('/bin', command),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  // fall back to which
  try {
    const result = execSync(`which ${command}`, { encoding: 'utf8' }).trim()
    if (result) return result
  } catch {
    // not found
  }
  return null
}

// ── Logging ──────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'Anima')
const LOG_FILE = path.join(LOG_DIR, 'setup.log')

function log(tag: string, ...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${tag}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
  process.stdout.write(line)
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line, 'utf8')
  } catch {
    // ignore log write errors
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const sessions = new Map<string, ChildProcess>()

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
  // Kill existing session for this id
  const existing = sessions.get(id)
  if (existing && !existing.killed) {
    existing.kill('SIGINT')
  }
  sessions.delete(id)

  const cliPath = resolveCliPath('claude')
  log(id, 'resolveCliPath =>', cliPath ?? 'NOT FOUND')
  if (!cliPath) {
    win.webContents.send('setup-chat-data', id, {
      event: 'error',
      message: 'claude CLI not found. Please install it via: npm install -g @anthropic-ai/claude-code',
    } satisfies SetupChatData)
    return
  }

  const systemPrompt = type === 'vision' ? VISION_PROMPT : type === 'soul' ? SOUL_PROMPT : INIT_PROMPT

  const homeDir = os.homedir()
  const extraPaths = [
    path.join(homeDir, '.local', 'bin'),
    path.join(homeDir, '.volta', 'bin'),
    path.join(homeDir, '.npm', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
  ]
  const currentPath = process.env.PATH || ''
  const newPath = [...extraPaths, currentPath].join(path.delimiter)

  const args = [
    '--verbose',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
    '--system-prompt', systemPrompt,
  ]

  log(id, 'spawn', cliPath, args.slice(0, -2).join(' '), '--system-prompt <omitted>')
  log(id, 'cwd', projectPath)

  const child = spawn(cliPath, args, {
    cwd: projectPath,
    env: {
      PATH: newPath,
      HOME: homeDir,
      USER: os.userInfo().username,
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
    } as NodeJS.ProcessEnv,
  })

  log(id, 'pid', String(child.pid ?? 'unknown'))
  sessions.set(id, child)

  let stdoutBuffer = ''

  child.stdout?.on('data', (data: Buffer) => {
    const raw = data.toString()
    log(id, 'stdout-raw', raw.replace(/\n/g, '\\n'))
    stdoutBuffer += raw
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() || ''
    for (const line of lines) {
      processLine(line, id, win)
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    const trimmed = data.toString().trim()
    log(id, 'stderr', trimmed)
    if (trimmed) {
      win.webContents.send('setup-chat-data', id, {
        event: 'error',
        message: trimmed,
      } satisfies SetupChatData)
    }
  })

  child.on('spawn', () => {
    log(id, 'event: spawn ok')
  })

  child.on('close', (code, signal) => {
    log(id, 'event: close', `code=${code}`, `signal=${signal}`)
    if (stdoutBuffer.trim()) {
      processLine(stdoutBuffer, id, win)
    }
    // Only remove if this child is still the active session (guard against race with restarts)
    if (sessions.get(id) === child) {
      sessions.delete(id)
    }
  })

  child.on('error', (err) => {
    log(id, 'event: error', err.message)
    win.webContents.send('setup-chat-data', id, {
      event: 'error',
      message: err.message,
    } satisfies SetupChatData)
    if (sessions.get(id) === child) {
      sessions.delete(id)
    }
  })
}

type ContentEntry = { type: string; text?: string; thinking?: string; name?: string; input?: unknown; id?: string; content?: unknown; is_error?: boolean }

function processLine(line: string, id: string, win: BrowserWindow): void {
  if (!line.trim()) return
  log(id, 'processLine', line.slice(0, 200))
  try {
    const json = JSON.parse(line)

    if (json.type === 'error' || json.error) {
      const msg = json.error?.message || json.error || json.message || 'Unknown error'
      win.webContents.send('setup-chat-data', id, { event: 'error', message: String(msg) } satisfies SetupChatData)
      return
    }

    if (json.type === 'system' && json.subtype === 'init') {
      win.webContents.send('setup-chat-data', id, {
        event: 'system',
        model: json.model ?? '',
        sessionId: json.session_id ?? '',
      } satisfies SetupChatData)
      return
    }

    if (json.type === 'rate_limit_event') {
      win.webContents.send('setup-chat-data', id, {
        event: 'rate_limit',
        utilization: json.rate_limit_info?.utilization ?? 0,
      } satisfies SetupChatData)
      return
    }

    if (json.type === 'assistant' && Array.isArray(json.message?.content)) {
      const content: ContentEntry[] = json.message.content

      for (const entry of content) {
        if (entry.type === 'thinking' && entry.thinking) {
          win.webContents.send('setup-chat-data', id, {
            event: 'thinking',
            thinking: entry.thinking,
          } satisfies SetupChatData)
        }
        if (entry.type === 'text' && entry.text) {
          win.webContents.send('setup-chat-data', id, {
            event: 'text',
            text: entry.text,
          } satisfies SetupChatData)
        }
        if (entry.type === 'tool_use' && entry.name) {
          win.webContents.send('setup-chat-data', id, {
            event: 'tool_use',
            toolName: entry.name,
            toolInput: JSON.stringify(entry.input ?? {}),
            toolCallId: entry.id ?? '',
          } satisfies SetupChatData)
        }
      }
    }

    if (json.type === 'user' && Array.isArray(json.message?.content)) {
      const content: ContentEntry[] = json.message.content
      for (const entry of content) {
        if (entry.type === 'tool_result') {
          const raw = entry.content
          const resultText = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
          win.webContents.send('setup-chat-data', id, {
            event: 'tool_result',
            toolCallId: entry.id ?? '',
            content: resultText,
            isError: entry.is_error ?? false,
          } satisfies SetupChatData)
        }
      }
    }

    if (json.type === 'result') {
      win.webContents.send('setup-chat-data', id, {
        event: 'done',
        result: json.result,
      } satisfies SetupChatData)
    }
  } catch {
    // non-JSON lines ignored
  }
}

export function sendSetupMessage(id: string, text: string): void {
  const child = sessions.get(id)
  if (!child || !child.stdin) {
    log(id, 'sendSetupMessage: no active session or stdin, dropping message')
    return
  }
  const payload = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: text },
  })
  log(id, 'stdin-write', payload)
  child.stdin.write(payload + '\n')
}

export function stopSetupSession(id: string): void {
  const child = sessions.get(id)
  if (child && !child.killed) {
    child.kill('SIGINT')
  }
  sessions.delete(id)
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
