import { AgentSessionManager } from './manager'
import { ClaudeCodeAgent } from './claude-code'
import type { AgentEvent } from './index'

const claudeCodeAgent = new ClaudeCodeAgent()

// ── ConversationAgent ─────────────────────────────────────────────────────────
// Manages persistent, multi-turn interactive sessions.
// Sessions stay alive between messages so the user can keep chatting.

class ConversationAgent {
  private manager = new AgentSessionManager()

  start(sessionId: string, options: { projectPath: string; systemPrompt: string; onEvent: (event: AgentEvent) => void }): void {
    this.manager.start(sessionId, claudeCodeAgent, options)
  }

  send(sessionId: string, message: string): void {
    this.manager.send(sessionId, message)
  }

  stop(sessionId: string): void {
    this.manager.stop(sessionId)
  }

  stopAll(): void {
    this.manager.stopAll()
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
