import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { createLogger } from '../../logger'
import { resolveCliPath, parseLine, findSessionFile, readEventsFromFile } from './parser'
import type { Agent, AgentEvent, AgentSession, AgentStartOptions } from '../index'

const log = createLogger('claude-code-agent')

// ── ClaudeCodeSession ─────────────────────────────────────────────────────────

class ClaudeCodeSession implements AgentSession {
  private child: ChildProcess
  private id: string
  private claudeSessionId: string | null = null
  private filePath: string | null = null
  private fileOffset = 0
  private fileWatcher: fs.FSWatcher | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private eventsListeners = new Set<(events: AgentEvent[]) => void>()

  constructor(child: ChildProcess, id: string) {
    this.child = child
    this.id = id
  }

  /** Called by ClaudeCodeAgent when the 'system' event reveals the Claude session ID. */
  initHistory(claudeSessionId: string): void {
    this.claudeSessionId = claudeSessionId
    this.resolveAndWatch(0)
  }

  readEvents(): AgentEvent[] {
    if (!this.filePath && this.claudeSessionId) {
      this.filePath = findSessionFile(this.claudeSessionId)
    }
    if (!this.filePath) return []
    return readEventsFromFile(this.filePath, 0).events
  }

  onEvents(listener: (events: AgentEvent[]) => void): () => void {
    this.eventsListeners.add(listener)
    return () => this.eventsListeners.delete(listener)
  }

  sendMessage(text: string): void {
    if (!this.child.stdin || this.child.killed || this.child.exitCode !== null) {
      log.warn('sendMessage: process not running, dropping message', { session: this.id })
      return
    }
    const payload = JSON.stringify({ type: 'user', message: { role: 'user', content: text } })
    log.debug('stdin-write', { session: this.id, payload })
    this.child.stdin.write(payload + '\n')
  }

  stop(): void {
    this.fileWatcher?.close()
    this.fileWatcher = null
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }

    if (this.child.exitCode !== null) return
    this.child.kill('SIGTERM')
    const pid = this.child.pid
    if (pid) {
      setTimeout(() => {
        try { process.kill(pid, 0) } catch { return }
        try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
      }, 3000)
    }
  }

  private resolveAndWatch(attempt: number): void {
    if (!this.claudeSessionId) return
    const filePath = findSessionFile(this.claudeSessionId)
    if (!filePath) {
      if (attempt >= 10) { log.warn('session file not found after retries', { id: this.id }); return }
      this.retryTimer = setTimeout(() => this.resolveAndWatch(attempt + 1), 500)
      return
    }

    log.info('watching session file', { id: this.id, filePath })
    this.filePath = filePath

    const { events: existing, newOffset } = readEventsFromFile(filePath, 0)
    this.fileOffset = newOffset
    if (existing.length > 0) this.emitToListeners(existing)

    try {
      this.fileWatcher = fs.watch(filePath, () => {
        const { events, newOffset: next } = readEventsFromFile(filePath, this.fileOffset)
        if (events.length > 0) { this.fileOffset = next; this.emitToListeners(events) }
      })
    } catch (err) {
      log.warn('fs.watch failed', { filePath, error: String(err) })
    }
  }

  private emitToListeners(events: AgentEvent[]): void {
    for (const listener of [...this.eventsListeners]) listener(events)
  }
}

// ── ClaudeCodeAgent ───────────────────────────────────────────────────────────

export class ClaudeCodeAgent implements Agent {
  start(options: AgentStartOptions): AgentSession {
    const { projectPath, systemPrompt, onEvent, onDone } = options
    const id = options.sessionId ?? `anon-${Date.now()}`

    const cliPath = resolveCliPath('claude')
    log.debug('resolveCliPath', { session: id, result: cliPath ?? 'NOT FOUND' })
    if (!cliPath) {
      onEvent({ event: 'error', message: 'claude CLI not found. Please install it via: npm install -g @anthropic-ai/claude-code' })
      onDone?.()
      return { sendMessage: () => {}, stop: () => {}, readEvents: () => [], onEvents: () => () => {} }
    }

    const homeDir = os.homedir()
    const extraPaths = [
      path.join(homeDir, '.local', 'bin'), path.join(homeDir, '.volta', 'bin'),
      path.join(homeDir, '.npm', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin',
    ]

    const args = [
      '--verbose', '--input-format', 'stream-json', '--output-format', 'stream-json',
      '--dangerously-skip-permissions', '--system-prompt', systemPrompt,
      ...(options.sessionId ? ['--resume', options.sessionId] : []),
    ]

    log.info('spawn', { session: id, cli: cliPath, cwd: projectPath })

    const child = spawn(cliPath, args, {
      cwd: projectPath,
      env: {
        ...process.env,
        PATH: [...extraPaths, process.env.PATH || ''].join(path.delimiter),
        HOME: homeDir,
        USER: os.userInfo().username,
        SHELL: '/bin/bash',
        TERM: 'xterm-256color',
      },
    })

    log.info('pid', { session: id, pid: child.pid ?? 'unknown' })

    const session = new ClaudeCodeSession(child, id)
    let stdoutBuffer = ''
    let resultSeen = false
    let stderrErrorEmitted = false

    const trackingOnEvent = (event: AgentEvent): void => {
      if (event.event === 'system') session.initHistory(event.sessionId)
      if (event.event === 'done') resultSeen = true
      onEvent(event)
    }

    child.stdout?.on('data', (data: Buffer) => {
      const raw = data.toString()
      log.debug('stdout', { session: id, raw: raw.replace(/\n/g, '\\n') })
      stdoutBuffer += raw
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''
      for (const line of lines) parseLine(line, trackingOnEvent)
    })

    child.stderr?.on('data', (data: Buffer) => {
      const trimmed = data.toString().trim()
      log.warn('stderr', { session: id, stderr: trimmed })
      if (trimmed) { stderrErrorEmitted = true; onEvent({ event: 'error', message: trimmed }) }
    })

    child.on('spawn', () => log.info('spawned', { session: id }))

    child.on('close', (code) => {
      log.info('close', { session: id, code })
      if (stdoutBuffer.trim()) parseLine(stdoutBuffer, trackingOnEvent)
      if (!resultSeen) {
        if (code !== 0 && !stderrErrorEmitted) onEvent({ event: 'error', message: `Process exited with code ${code}` })
        else if (code === 0) onEvent({ event: 'done' })
      }
      onDone?.()
    })

    child.on('error', (err) => {
      log.error('process error', { session: id, error: err.message })
      onEvent({ event: 'error', message: err.message })
    })

    return session
  }
}
