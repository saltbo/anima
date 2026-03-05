import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import {
  Agent,
  AgentHeader,
} from '@/components/ai-elements/agent'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentEvent } from '@/types/agent'
import { AlertTriangle, XCircle } from 'lucide-react'

// ── Event types rendered in the timeline ──────────────────────────────────────

type TimelineEvent =
  | { kind: 'text'; id: number; text: string; role: 'user' | 'assistant' }
  | { kind: 'thinking'; id: number; thinking: string }
  | {
      kind: 'tool_call'; id: number; toolName: string
      toolInput: unknown; toolCallId: string
      output?: unknown; errorText?: string
    }
  | { kind: 'system'; id: number; model: string; sessionId: string }
  | { kind: 'rate_limit'; id: number; utilization: number }
  | { kind: 'error'; id: number; message: string }

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function SystemBanner({ model, sessionId }: { model: string; sessionId: string }) {
  return (
    <Agent>
      <AgentHeader name={model || 'claude'} model={sessionId ? `Session ${sessionId.slice(0, 8)}` : undefined} />
    </Agent>
  )
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  return (
    <ChainOfThought defaultOpen={false}>
      <ChainOfThoughtHeader>Thinking</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtStep
          label={<span className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{thinking}</span>}
        />
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}

function ToolCallBlock({ toolName, toolInput, output, errorText }: {
  toolName: string
  toolInput: unknown
  output?: unknown
  errorText?: string
}) {
  // Determine state for ToolHeader based on whether we have output
  const hasResult = output !== undefined || errorText !== undefined
  const state = errorText ? 'output-error' : hasResult ? 'output-available' : 'input-available'

  return (
    <Tool defaultOpen={false}>
      <ToolHeader
        type="dynamic-tool"
        toolName={toolName}
        state={state}
      />
      <ToolContent>
        <ToolInput input={toolInput} />
        {hasResult && (
          <ToolOutput output={output} errorText={errorText} />
        )}
      </ToolContent>
    </Tool>
  )
}

function RateLimitBadge({ utilization }: { utilization: number }) {
  return (
    <Badge variant="outline" className="gap-1.5 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700">
      <AlertTriangle size={11} />
      Rate limit {Math.round(utilization * 100)}% used
    </Badge>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <Badge variant="destructive" className="gap-1.5 whitespace-pre-wrap py-1.5 h-auto text-left font-normal">
      <XCircle size={12} className="shrink-0" />
      {message}
    </Badge>
  )
}

// ── AgentEvent → TimelineEvent ────────────────────────────────────────────────

/** Parse tool input string into an object for ToolInput display */
function parseToolInput(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return raw }
}

function applyAgentEvent(
  event: AgentEvent,
  push: (ev: TimelineEvent) => void,
  update: (pred: (ev: TimelineEvent) => boolean, patch: Partial<TimelineEvent>) => void,
  nextId: () => number
): void {
  const base = { id: nextId() }
  switch (event.event) {
    case 'text':
      push({ kind: 'text', ...base, text: event.text, role: event.role })
      break
    case 'thinking':
      push({ kind: 'thinking', ...base, thinking: event.thinking })
      break
    case 'tool_use':
      push({
        kind: 'tool_call', ...base,
        toolName: event.toolName,
        toolInput: parseToolInput(event.toolInput),
        toolCallId: event.toolCallId,
      })
      break
    case 'tool_result':
      // Merge result into the matching tool_call event
      update(
        (ev) => ev.kind === 'tool_call' && ev.toolCallId === event.toolCallId,
        event.isError
          ? { errorText: event.content }
          : { output: event.content },
      )
      break
    case 'system':
      push({ kind: 'system', ...base, model: event.model, sessionId: event.sessionId })
      break
    case 'rate_limit':
      push({ kind: 'rate_limit', ...base, utilization: event.utilization })
      break
    case 'error':
      push({ kind: 'error', ...base, message: event.message })
      break
    case 'done':
      break
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export interface AgentChatHandle {
  appendUserMessage: (text: string) => void
}

export interface AgentChatProps {
  /** Session ID — loads history then subscribes to file-watch push via IPC. */
  sessionId?: string
  /** Render the input bar. Caller controls send logic. */
  input?: React.ReactNode
  /** Extra content rendered below the conversation (e.g. action buttons) */
  footer?: React.ReactNode
  className?: string
  /** Called when a 'done' event is received (agent finished). */
  onDone?: () => void
}

export const AgentChat = forwardRef<AgentChatHandle, AgentChatProps>(
function AgentChat({ sessionId, input, footer, className, onDone }, ref) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const idRef = useRef(0)
  const nextId = useCallback(() => idRef.current++, [])
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  const push = useCallback((ev: TimelineEvent) => {
    setEvents((prev) => {
      // For streaming text: accumulate into the last text bubble of same role
      if (ev.kind === 'text' && ev.role === 'assistant') {
        const last = prev[prev.length - 1]
        if (last?.kind === 'text' && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, text: last.text + ev.text }]
        }
      }
      return [...prev, ev]
    })
  }, [])

  const update = useCallback(
    (pred: (ev: TimelineEvent) => boolean, patch: Partial<TimelineEvent>) => {
      setEvents((prev) => {
        // Find the last matching event and merge the patch
        const idx = prev.findLastIndex(pred)
        if (idx === -1) return prev
        const updated = [...prev]
        updated[idx] = { ...updated[idx], ...patch } as TimelineEvent
        return updated
      })
    },
    [],
  )

  const applyEvents = useCallback((incoming: AgentEvent[]) => {
    for (const ev of incoming) {
      applyAgentEvent(ev, push, update, nextId)
      if (ev.event === 'done') onDoneRef.current?.()
    }
  }, [push, update, nextId])

  useImperativeHandle(ref, () => ({
    appendUserMessage: (text: string) => {
      push({ kind: 'text', id: nextId(), text, role: 'user' })
    },
  }), [push, nextId])

  // Load history via watchSession, then receive incremental updates via IPC push
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    // Reset state for new session
    setEvents([])
    idRef.current = 0

    // Start watching — returns existing events as history
    window.electronAPI.watchSession(sessionId).then((history) => {
      if (cancelled) return
      if (history.length > 0) applyEvents(history as AgentEvent[])
    })

    // Subscribe to incremental push events from fs.watch
    const unsub = window.electronAPI.onSessionEvent((data) => {
      if (cancelled || data.sessionId !== sessionId) return
      applyEvents([data.event])
    })

    return () => {
      cancelled = true
      unsub()
      window.electronAPI.unwatchSession(sessionId)
    }
  }, [sessionId, applyEvents])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <Conversation className="flex-1 px-4">
        <ConversationContent className="gap-4">
          {events.map((ev) => {
            switch (ev.kind) {
              case 'system':
                return <SystemBanner key={ev.id} model={ev.model} sessionId={ev.sessionId} />

              case 'thinking':
                return <ThinkingBlock key={ev.id} thinking={ev.thinking} />

              case 'text':
                return (
                  <Message key={ev.id} from={ev.role}>
                    <MessageContent>
                      {ev.role === 'user'
                        ? <p className="whitespace-pre-wrap text-sm">{ev.text}</p>
                        : <MessageResponse>{ev.text}</MessageResponse>
                      }
                    </MessageContent>
                  </Message>
                )

              case 'tool_call':
                return (
                  <ToolCallBlock
                    key={ev.id}
                    toolName={ev.toolName}
                    toolInput={ev.toolInput}
                    output={ev.output}
                    errorText={ev.errorText}
                  />
                )

              case 'rate_limit':
                return <RateLimitBadge key={ev.id} utilization={ev.utilization} />

              case 'error':
                return <ErrorBlock key={ev.id} message={ev.message} />
            }
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {footer && (
        <div className="shrink-0 border-t border-border">
          {footer}
        </div>
      )}

      {input && (
        <div className="shrink-0 px-4 py-3 border-t border-border">
          {input}
        </div>
      )}
    </div>
  )
})

AgentChat.displayName = 'AgentChat'
