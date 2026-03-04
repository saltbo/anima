import { spawn } from 'child_process'
import * as path from 'path'
import * as os from 'os'
import { createLogger } from '../logger'
import { resolveCliPath, parseLine } from './claude-code/parser'
import type { AgentEvent } from '../../../src/types/agent'

const log = createLogger('agent-runner')

// ── Types ────────────────────────────────────────────────────────────────────

export interface RunOptions {
  projectPath: string
  sessionId: string
  systemPrompt: string
  message: string
  mcpConfigPath?: string
  onEvent?: (event: AgentEvent) => void
  signal?: AbortSignal
}

export interface ResumeOptions {
  projectPath: string
  sessionId: string
  message: string
  mcpConfigPath?: string
  onEvent?: (event: AgentEvent) => void
  signal?: AbortSignal
}

export interface RunResult {
  sessionId: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
  cost: number
  model: string
}

// ── AgentRunner ──────────────────────────────────────────────────────────────

export class AgentRunner {
  async run(options: RunOptions): Promise<RunResult> {
    const args = ['--session-id', options.sessionId, '--system-prompt', options.systemPrompt]
    return this.execute(options.projectPath, options.sessionId, args, options.message, options.onEvent, options.signal, options.mcpConfigPath)
  }

  async resume(options: ResumeOptions): Promise<RunResult> {
    const args = ['--resume', options.sessionId]
    return this.execute(options.projectPath, options.sessionId, args, options.message, options.onEvent, options.signal, options.mcpConfigPath)
  }

  private async execute(
    projectPath: string,
    sessionId: string,
    extraArgs: string[],
    message: string,
    onEvent?: (event: AgentEvent) => void,
    signal?: AbortSignal,
    mcpConfigPath?: string
  ): Promise<RunResult> {
    const cliPath = resolveCliPath('claude')
    if (!cliPath) {
      throw new Error('claude CLI not found. Please install it via: npm install -g @anthropic-ai/claude-code')
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

    const args = [
      '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      ...(mcpConfigPath ? ['--mcp-config', mcpConfigPath, '--strict-mcp-config'] : []),
      ...extraArgs,
    ]

    log.info('spawn', { cwd: projectPath, args: args.join(' ') })

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

    return new Promise<RunResult>((resolve, reject) => {
      let model = ''
      const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
      let cost = 0
      let stdoutBuffer = ''
      let resultSeen = false
      let stderrErrorEmitted = false
      let messageSent = false

      const handleEvent = (event: AgentEvent): void => {
        onEvent?.(event)

        if (event.event === 'system') {
          model = event.model || model
        }
        if (event.event === 'done') {
          resultSeen = true
          if (event.usage) {
            usage.inputTokens += event.usage.inputTokens
            usage.outputTokens += event.usage.outputTokens
            usage.cacheReadTokens += event.usage.cacheReadTokens
            usage.cacheCreationTokens += event.usage.cacheCreationTokens
          }
          if (event.totalCostUsd) cost += event.totalCostUsd
          if (event.model) model = event.model
        }
      }

      // Handle abort signal
      const onAbort = (): void => {
        child.kill('SIGTERM')
        const pid = child.pid
        if (pid) {
          setTimeout(() => {
            try { process.kill(pid, 0) } catch { return }
            try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
          }, 3000)
        }
      }
      if (signal) {
        if (signal.aborted) { child.kill('SIGTERM'); reject(new Error('Aborted')); return }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      child.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() || ''
        for (const line of lines) parseLine(line, handleEvent)
      })

      child.stderr?.on('data', (data: Buffer) => {
        const trimmed = data.toString().trim()
        if (trimmed) {
          log.warn('stderr', { stderr: trimmed })
          stderrErrorEmitted = true
          onEvent?.({ event: 'error', message: trimmed })
        }
      })

      child.on('spawn', () => {
        log.info('spawned', { pid: child.pid })
        // Send message once process is ready, then close stdin so CLI knows input is done
        if (!messageSent) {
          messageSent = true
          const payload = JSON.stringify({ type: 'user', message: { role: 'user', content: message } })
          child.stdin?.write(payload + '\n')
          child.stdin?.end()
        }
      })

      child.on('close', (code) => {
        log.info('close', { code })
        signal?.removeEventListener('abort', onAbort)

        // Parse remaining buffer
        if (stdoutBuffer.trim()) parseLine(stdoutBuffer, handleEvent)

        if (!resultSeen) {
          if (code !== 0 && !stderrErrorEmitted) {
            onEvent?.({ event: 'error', message: `Process exited with code ${code}` })
          } else if (code === 0) {
            onEvent?.({ event: 'done' })
          }
        }

        if (signal?.aborted) {
          reject(new Error('Aborted'))
        } else if (code !== 0 && !resultSeen) {
          reject(new Error(`Process exited with code ${code}`))
        } else {
          resolve({ sessionId, usage, cost, model })
        }
      })

      child.on('error', (err) => {
        log.error('process error', { error: err.message })
        signal?.removeEventListener('abort', onAbort)
        onEvent?.({ event: 'error', message: err.message })
        reject(err)
      })
    })
  }
}
