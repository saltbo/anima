import { AgentManager } from './manager'
import { ClaudeCodeAgent } from './claude-code'
import type { AgentEvent } from './index'

const claudeCodeAgent = new ClaudeCodeAgent()

// ── ConversationAgent ─────────────────────────────────────────────────────────
// Manages persistent, multi-turn interactive sessions.
// Sessions stay alive between messages so the user can keep chatting.
// Supports multiple event listeners per session via addListener().

class ConversationAgent {
  private manager = new AgentManager()
  private listeners = new Map<string, Set<(event: AgentEvent) => void>>()

  start(agentKey: string, options: { projectPath: string; systemPrompt: string; sessionId?: string; onEvent: (event: AgentEvent) => void }): void {
    const listenerSet = new Set<(event: AgentEvent) => void>()
    listenerSet.add(options.onEvent)
    this.listeners.set(agentKey, listenerSet)

    this.manager.start(agentKey, claudeCodeAgent, {
      projectPath: options.projectPath,
      systemPrompt: options.systemPrompt,
      sessionId: options.sessionId,
      onEvent: (event) => {
        const set = this.listeners.get(agentKey)
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
  addListener(agentKey: string, listener: (event: AgentEvent) => void): () => void {
    const set = this.listeners.get(agentKey)
    if (set) set.add(listener)
    return () => {
      const s = this.listeners.get(agentKey)
      if (s) s.delete(listener)
    }
  }

  send(agentKey: string, message: string): void {
    this.manager.send(agentKey, message)
  }

  stop(agentKey: string): void {
    this.manager.stop(agentKey)
    this.listeners.delete(agentKey)
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
  private manager = new AgentManager()

  run(agentKey: string, options: TaskOptions): void {
    const { projectPath, systemPrompt, message, onEvent, onComplete } = options

    this.manager.start(agentKey, claudeCodeAgent, {
      projectPath,
      systemPrompt,
      onEvent: (event) => {
        onEvent(event)
        if (event.event === 'done') {
          onComplete?.()
          this.manager.stop(agentKey)
        }
      },
    })

    setTimeout(() => this.manager.send(agentKey, message), 500)
  }

  stop(agentKey: string): void {
    this.manager.stop(agentKey)
  }

  stopAll(): void {
    this.manager.stopAll()
  }
}

export const conversationAgent = new ConversationAgent()
export const taskAgent = new TaskAgent()
