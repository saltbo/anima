import type { AgentEvent } from '../../../src/types/agent'

export type { AgentEvent }

export interface AgentStartOptions {
  /** Claude API session ID for resuming an interrupted session via --resume */
  sessionId?: string
  projectPath: string
  systemPrompt: string
  onEvent: (event: AgentEvent) => void
  /** Called once when the underlying process terminates (naturally or on error) */
  onDone?: () => void
}

export interface AgentSession {
  sendMessage(text: string): void
  stop(): void
}

export interface Agent {
  start(options: AgentStartOptions): AgentSession
}
