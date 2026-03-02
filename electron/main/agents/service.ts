import { AgentManager } from './manager'
import { ClaudeCodeAgent } from './claude-code/index'
import type { AgentEvent } from './index'
import { createLogger } from '../logger'

const log = createLogger('conversation-agent')

const claudeCodeAgent = new ClaudeCodeAgent()

const AGENT_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export const agentManager = new AgentManager()

// ── ConversationAgent ─────────────────────────────────────────────────────────

class ConversationAgent {
  start(
    agentKey: string,
    options: {
      projectPath: string
      systemPrompt: string
      sessionId?: string
      onEvent: (event: AgentEvent) => void
    }
  ): void {
    agentManager.start(agentKey, claudeCodeAgent, options)
  }

  /**
   * Start a session, send `firstMessage` when Claude Code is ready,
   * resolve with the result when done. `onEvent` is for business logic only.
   */
  run(
    agentKey: string,
    options: {
      projectPath: string
      systemPrompt: string
      sessionId?: string
      firstMessage: string
      onEvent?: (event: AgentEvent) => void
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }

      const timer = setTimeout(() => {
        settle(() => {
          agentManager.stop(agentKey)
          reject(new Error(`Agent session ${agentKey} timed out`))
        })
      }, AGENT_TIMEOUT_MS)

      agentManager.start(agentKey, claudeCodeAgent, {
        projectPath: options.projectPath,
        systemPrompt: options.systemPrompt,
        sessionId: options.sessionId,
        onSpawn: () => {
          log.debug('process spawned, sending firstMessage', { agentKey, length: options.firstMessage.length })
          agentManager.send(agentKey, options.firstMessage)
        },
        onEvent: (event) => {
          options.onEvent?.(event)
          if (event.event === 'done') settle(() => resolve(event.result ?? ''))
          if (event.event === 'error') settle(() => reject(new Error(event.message)))
        },
      })
    })
  }

  /**
   * Send a follow-up message to a running session and resolve when done.
   */
  continue(
    agentKey: string,
    message: string,
    onEvent?: (event: AgentEvent) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        removeListener()
        fn()
      }

      const timer = setTimeout(() => {
        settle(() => reject(new Error(`Agent session ${agentKey} timed out on continue`)))
      }, AGENT_TIMEOUT_MS)

      const removeListener = agentManager.addProcessListener(agentKey, (event) => {
        onEvent?.(event)
        if (event.event === 'done') settle(() => resolve(event.result ?? ''))
        if (event.event === 'error') settle(() => reject(new Error(event.message)))
      })

      agentManager.send(agentKey, message)
    })
  }

  send(agentKey: string, message: string): void {
    agentManager.send(agentKey, message)
  }

  stop(agentKey: string): void {
    agentManager.stop(agentKey)
  }

  stopAll(): void {
    agentManager.stopAll()
  }
}

// ── TaskAgent ─────────────────────────────────────────────────────────────────

interface TaskOptions {
  projectPath: string
  systemPrompt: string
  message: string
  onEvent?: (event: AgentEvent) => void
  onComplete?: () => void
}

class TaskAgent {
  run(agentKey: string, options: TaskOptions): void {
    const { projectPath, systemPrompt, message, onEvent, onComplete } = options

    agentManager.start(agentKey, claudeCodeAgent, {
      projectPath,
      systemPrompt,
      onSpawn: () => agentManager.send(agentKey, message),
      onEvent: (event) => {
        onEvent?.(event)
        if (event.event === 'done') onComplete?.()
      },
    })
  }

  stop(agentKey: string): void {
    agentManager.stop(agentKey)
  }

  stopAll(): void {
    agentManager.stopAll()
  }
}

export const conversationAgent = new ConversationAgent()
export const taskAgent = new TaskAgent()
