import { spawn, execSync, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createLogger } from '../logger'
import type { Agent, AgentEvent, AgentSession, AgentStartOptions } from './index'

const log = createLogger('claude-code-agent')

type ContentEntry = {
  type: string
  text?: string
  thinking?: string
  name?: string
  input?: unknown
  id?: string
  content?: unknown
  is_error?: boolean
}

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
  try {
    const result = execSync(`which ${command}`, { encoding: 'utf8' }).trim()
    if (result) return result
  } catch {
    // not found
  }
  return null
}

function parseLine(line: string, onEvent: (event: AgentEvent) => void): void {
  if (!line.trim()) return
  try {
    const json = JSON.parse(line)

    if (json.type === 'error' || json.error) {
      const msg = json.error?.message || json.error || json.message || 'Unknown error'
      onEvent({ event: 'error', message: String(msg) })
      return
    }

    if (json.type === 'system' && json.subtype === 'init') {
      onEvent({ event: 'system', model: json.model ?? '', sessionId: json.session_id ?? '' })
      return
    }

    if (json.type === 'rate_limit_event') {
      onEvent({ event: 'rate_limit', utilization: json.rate_limit_info?.utilization ?? 0 })
      return
    }

    if (json.type === 'assistant' && Array.isArray(json.message?.content)) {
      const content: ContentEntry[] = json.message.content
      for (const entry of content) {
        if (entry.type === 'thinking' && entry.thinking) {
          onEvent({ event: 'thinking', thinking: entry.thinking })
        }
        if (entry.type === 'text' && entry.text) {
          onEvent({ event: 'text', text: entry.text })
        }
        if (entry.type === 'tool_use' && entry.name) {
          onEvent({
            event: 'tool_use',
            toolName: entry.name,
            toolInput: JSON.stringify(entry.input ?? {}),
            toolCallId: entry.id ?? '',
          })
        }
      }
    }

    if (json.type === 'user' && Array.isArray(json.message?.content)) {
      const content: ContentEntry[] = json.message.content
      for (const entry of content) {
        if (entry.type === 'tool_result') {
          const raw = entry.content
          const resultText = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
          onEvent({
            event: 'tool_result',
            toolCallId: entry.id ?? '',
            content: resultText,
            isError: entry.is_error ?? false,
          })
        }
      }
    }

    if (json.type === 'result') {
      onEvent({ event: 'done', result: json.result })
    }
  } catch {
    // non-JSON lines ignored
  }
}

class ClaudeCodeSession implements AgentSession {
  private child: ChildProcess
  private sessionId: string

  constructor(child: ChildProcess, sessionId: string) {
    this.child = child
    this.sessionId = sessionId
  }

  sendMessage(text: string): void {
    if (!this.child.stdin) {
      log.warn('sendMessage: no stdin, dropping message', { session: this.sessionId })
      return
    }
    const payload = JSON.stringify({ type: 'user', message: { role: 'user', content: text } })
    log.debug('stdin-write', { session: this.sessionId, payload })
    this.child.stdin.write(payload + '\n')
  }

  stop(): void {
    if (!this.child.killed) {
      this.child.kill('SIGINT')
    }
  }
}

export class ClaudeCodeAgent implements Agent {
  start(options: AgentStartOptions): AgentSession {
    const { projectPath, systemPrompt, onEvent } = options
    const sessionId = `${Date.now()}`

    const cliPath = resolveCliPath('claude')
    log.debug('resolveCliPath', { result: cliPath ?? 'NOT FOUND' })
    if (!cliPath) {
      onEvent({
        event: 'error',
        message: 'claude CLI not found. Please install it via: npm install -g @anthropic-ai/claude-code',
      })
      // Return a no-op session
      return { sendMessage: () => {}, stop: () => {} }
    }

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
    const newPath = [...extraPaths, process.env.PATH || ''].join(path.delimiter)

    const args = [
      '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--system-prompt', systemPrompt,
    ]

    log.info('spawn', { session: sessionId, cli: cliPath, args: args.slice(0, -2).join(' '), cwd: projectPath })

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

    log.info('pid', { session: sessionId, pid: child.pid ?? 'unknown' })

    const session = new ClaudeCodeSession(child, sessionId)
    let stdoutBuffer = ''

    child.stdout?.on('data', (data: Buffer) => {
      const raw = data.toString()
      log.debug('stdout', { session: sessionId, raw: raw.replace(/\n/g, '\\n') })
      stdoutBuffer += raw
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''
      for (const line of lines) {
        parseLine(line, onEvent)
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const trimmed = data.toString().trim()
      log.warn('stderr', { session: sessionId, stderr: trimmed })
      if (trimmed) {
        onEvent({ event: 'error', message: trimmed })
      }
    })

    child.on('spawn', () => {
      log.info('spawned', { session: sessionId })
    })

    child.on('close', (code, signal) => {
      log.info('close', { session: sessionId, code, signal })
      if (stdoutBuffer.trim()) {
        parseLine(stdoutBuffer, onEvent)
      }
    })

    child.on('error', (err) => {
      log.error('process error', { session: sessionId, error: err.message })
      onEvent({ event: 'error', message: err.message })
    })

    return session
  }
}
