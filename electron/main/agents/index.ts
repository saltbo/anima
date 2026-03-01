export type AgentEvent =
  | { event: 'text'; text: string }
  | { event: 'thinking'; thinking: string }
  | { event: 'tool_use'; toolName: string; toolInput: string; toolCallId: string }
  | { event: 'tool_result'; toolCallId: string; content: string; isError: boolean }
  | { event: 'system'; model: string; sessionId: string }
  | { event: 'rate_limit'; utilization: number }
  | { event: 'done'; result?: string }
  | { event: 'error'; message: string }

export interface AgentStartOptions {
  /** Logical session id forwarded from the manager; used for log correlation */
  id?: string
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
