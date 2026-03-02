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
  /** Called once when the process is spawned and ready to receive messages */
  onSpawn?: () => void
}

export interface AgentSession {
  sendMessage(text: string): void
  stop(): void
  /** Read full event history for this session (for initial page load). */
  readEvents(): AgentEvent[]
  /** Subscribe to incremental events as they arrive (for live UI updates). Returns unsubscribe fn. */
  onEvents(listener: (events: AgentEvent[]) => void): () => void
}

export interface Agent {
  start(options: AgentStartOptions): AgentSession
}
