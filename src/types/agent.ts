export type AgentEvent =
  | { event: 'text'; text: string; role: 'user' | 'assistant' }
  | { event: 'thinking'; thinking: string }
  | { event: 'tool_use'; toolName: string; toolInput: string; toolCallId: string }
  | { event: 'tool_result'; toolCallId: string; content: string; isError: boolean }
  | { event: 'system'; model: string; sessionId: string }
  | { event: 'rate_limit'; utilization: number }
  | { event: 'done'; result?: string; totalCostUsd?: number; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }; model?: string }
  | { event: 'error'; message: string; code?: string }
