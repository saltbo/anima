import { AgentSessionManager } from './manager'
import { ClaudeCodeAgent } from './claude-code'
import type { AgentEvent } from './index'

const claudeCodeAgent = new ClaudeCodeAgent()

// ── ConversationAgent ─────────────────────────────────────────────────────────
// Manages persistent, multi-turn interactive sessions.
// Sessions stay alive between messages so the user can keep chatting.
// Supports multiple event listeners per session via addListener().

class ConversationAgent {
  private manager = new AgentSessionManager()
  private listeners = new Map<string, Set<(event: AgentEvent) => void>>()

  start(sessionId: string, options: { projectPath: string; systemPrompt: string; onEvent: (event: AgentEvent) => void }): void {
    const listenerSet = new Set<(event: AgentEvent) => void>()
    listenerSet.add(options.onEvent)
    this.listeners.set(sessionId, listenerSet)

    this.manager.start(sessionId, claudeCodeAgent, {
      projectPath: options.projectPath,
      systemPrompt: options.systemPrompt,
      onEvent: (event) => {
        const set = this.listeners.get(sessionId)
        if (set) {
          // snapshot to avoid mutation during iteration
          for (const listener of [...set]) {
            listener(event)
          }
        }
      },
    })
  }

  /** Add an additional event listener for an existing session. Returns a cleanup function. */
  addListener(sessionId: string, listener: (event: AgentEvent) => void): () => void {
    const set = this.listeners.get(sessionId)
    if (set) set.add(listener)
    return () => {
      const s = this.listeners.get(sessionId)
      if (s) s.delete(listener)
    }
  }

  send(sessionId: string, message: string): void {
    this.manager.send(sessionId, message)
  }

  stop(sessionId: string): void {
    this.manager.stop(sessionId)
    this.listeners.delete(sessionId)
  }

  stopAll(): void {
    this.manager.stopAll()
    this.listeners.clear()
  }
}

// ── TaskAgent ─────────────────────────────────────────────────────────────────
// Executes a single-turn task: send one message, stream events, auto-terminate
// when the agent returns `result`. Process lifecycle is fully managed internally.

interface TaskOptions {
  projectPath: string
  systemPrompt: string
  message: string
  onEvent: (event: AgentEvent) => void
  onComplete?: () => void
}

class TaskAgent {
  private manager = new AgentSessionManager()

  run(sessionId: string, options: TaskOptions): void {
    const { projectPath, systemPrompt, message, onEvent, onComplete } = options

    this.manager.start(sessionId, claudeCodeAgent, {
      projectPath,
      systemPrompt,
      onEvent: (event) => {
        onEvent(event)
        if (event.event === 'done') {
          onComplete?.()
          this.manager.stop(sessionId)
        }
      },
    })

    setTimeout(() => this.manager.send(sessionId, message), 500)
  }

  stop(sessionId: string): void {
    this.manager.stop(sessionId)
  }

  stopAll(): void {
    this.manager.stopAll()
  }
}

export const conversationAgent = new ConversationAgent()
export const taskAgent = new TaskAgent()
