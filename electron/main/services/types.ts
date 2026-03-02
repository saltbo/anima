import type { AgentEvent } from '../agents/index'

/** Minimal interface for ConversationAgent — decouples services from agent implementation */
export interface ConversationAgent {
  run(
    agentKey: string,
    options: {
      projectPath: string
      systemPrompt: string
      sessionId?: string
      firstMessage: string
      onEvent?: (event: AgentEvent) => void
    }
  ): Promise<string>

  continue(
    agentKey: string,
    message: string,
    onEvent?: (event: AgentEvent) => void
  ): Promise<string>

  send(agentKey: string, message: string): void
  stop(agentKey: string): void
}

/** Minimal interface for TaskAgent — decouples services from agent implementation */
export interface TaskAgent {
  run(
    agentKey: string,
    options: {
      projectPath: string
      systemPrompt: string
      message: string
      onEvent?: (event: AgentEvent) => void
      onComplete?: () => void
    }
  ): void
}
