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
import { cn } from '@/lib/utils'
import type { AgentEvent } from '@/types/agent'
import { Terminal, CheckCircle, XCircle, AlertTriangle, Cpu, ChevronRight } from 'lucide-react'

// ── Event types rendered in the timeline ──────────────────────────────────────

type TimelineEvent =
  | { kind: 'text'; id: number; text: string; role: 'user' | 'assistant' }
  | { kind: 'thinking'; id: number; thinking: string }
  | { kind: 'tool_use'; id: number; toolName: string; toolInput: string; toolCallId: string }
  | { kind: 'tool_result'; id: number; toolCallId: string; content: string; isError: boolean }
  | { kind: 'system'; id: number; model: string; sessionId: string }
  | { kind: 'rate_limit'; id: number; utilization: number }
  | { kind: 'error'; id: number; message: string }

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function SystemBanner({ model, sessionId }: { model: string; sessionId: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
      <Cpu size={12} />
      <span className="font-mono font-medium">{model || 'claude'}</span>
      {sessionId && (
        <>
          <span className="opacity-40">·</span>
          <span className="font-mono opacity-60 truncate max-w-[200px]">{sessionId}</span>
        </>
      )}
    </div>
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

function ToolCallBlock({ toolName, toolInput }: { toolName: string; toolInput: string }) {
  let parsed: Record<string, unknown> | null = null
  try { parsed = JSON.parse(toolInput) } catch { /* raw */ }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
      <Terminal size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="font-mono font-semibold text-foreground">{toolName}</span>
        {parsed && Object.keys(parsed).length > 0 && (
          <div className="mt-1 space-y-0.5">
            {Object.entries(parsed).map(([k, v]) => (
              <div key={k} className="flex gap-1.5">
                <span className="text-muted-foreground shrink-0">{k}:</span>
                <span className="font-mono text-foreground truncate">
                  {typeof v === 'string' ? v : JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <ChevronRight size={12} className="mt-0.5 shrink-0 text-muted-foreground opacity-50" />
    </div>
  )
}

function ToolResultBlock({ content, isError }: { content: string; isError: boolean }) {
  const preview = content.length > 300 ? content.slice(0, 300) + '…' : content
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
      isError
        ? 'border-destructive/40 bg-destructive/5 text-destructive'
        : 'border-border bg-muted/20 text-muted-foreground'
    )}>
      {isError
        ? <XCircle size={12} className="mt-0.5 shrink-0" />
        : <CheckCircle size={12} className="mt-0.5 shrink-0" />
      }
      <pre className="whitespace-pre-wrap break-all font-mono leading-relaxed">{preview}</pre>
    </div>
  )
}

function RateLimitBadge({ utilization }: { utilization: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
      <AlertTriangle size={11} />
      <span>Rate limit {Math.round(utilization * 100)}% used</span>
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <XCircle size={12} className="mt-0.5 shrink-0" />
      <span className="whitespace-pre-wrap">{message}</span>
    </div>
  )
}

// ── AgentEvent → TimelineEvent ────────────────────────────────────────────────

function applyAgentEvent(
  event: AgentEvent,
  push: (ev: TimelineEvent) => void,
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
      push({ kind: 'tool_use', ...base, toolName: event.toolName, toolInput: event.toolInput, toolCallId: event.toolCallId })
      break
    case 'tool_result':
      push({ kind: 'tool_result', ...base, toolCallId: event.toolCallId, content: event.content, isError: event.isError })
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
  /** Live mode: stream events from a running agent by its agentKey */
  agentKey?: string
  /** History mode: load events from a completed session by its Claude sessionId */
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
function AgentChat({ agentKey, sessionId, input, footer, className, onDone }, ref) {
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

  const applyEvents = useCallback((incoming: AgentEvent[]) => {
    for (const ev of incoming) {
      applyAgentEvent(ev, push, nextId)
      if (ev.event === 'done') onDoneRef.current?.()
    }
  }, [push, nextId])

  useImperativeHandle(ref, () => ({
    appendUserMessage: (text: string) => {
      push({ kind: 'text', id: nextId(), text, role: 'user' })
    },
  }), [push, nextId])

  // History mode: load events from completed session file (one-shot, no streaming)
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setEvents([])
    idRef.current = 0
    window.electronAPI.readSessionEvents(sessionId).then((history) => {
      if (!cancelled) applyEvents(history as AgentEvent[])
    })
    return () => { cancelled = true }
  }, [sessionId, applyEvents])

  // Live mode: stream incremental updates + poll for catch-up
  //
  // The agent process may emit events before this component subscribes (IPC
  // timing gap). We subscribe first for real-time events, then poll
  // readAgentEvents until the session file becomes available and we can
  // backfill any events that arrived before the subscription.
  useEffect(() => {
    if (!agentKey || sessionId) return
    let cancelled = false
    let backfilled = false

    // 1. Subscribe to real-time events immediately
    const unsub = window.electronAPI.onAgentEvents((key, incoming) => {
      if (key !== agentKey) return
      applyEvents(incoming as AgentEvent[])
    })

    // 2. Poll readAgentEvents to backfill events that arrived before subscription.
    //    The session file may not exist yet, so retry a few times.
    const tryBackfill = (): void => {
      if (cancelled || backfilled) return
      window.electronAPI.readAgentEvents(agentKey).then((history) => {
        if (cancelled || backfilled) return
        if (history.length > 0) {
          backfilled = true
          // Reset and replay full history to get a clean timeline
          setEvents([])
          idRef.current = 0
          applyEvents(history as AgentEvent[])
        }
      })
    }

    // Initial attempt + retries at 1s, 2s, 3s
    tryBackfill()
    const timers = [1000, 2000, 3000].map((ms) => setTimeout(tryBackfill, ms))

    return () => {
      cancelled = true
      unsub()
      timers.forEach(clearTimeout)
    }
  }, [agentKey, sessionId, applyEvents])

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

              case 'tool_use':
                return <ToolCallBlock key={ev.id} toolName={ev.toolName} toolInput={ev.toolInput} />

              case 'tool_result':
                return <ToolResultBlock key={ev.id} content={ev.content} isError={ev.isError} />

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

// ── Helper hook for adding user messages to the timeline ──────────────────────

export function useAgentChat() {
  const [events, setEvents] = useState<TimelineEvent[]>([])

  const addUserMessage = useCallback((text: string) => {
    setEvents((prev) => [...prev, { kind: 'text', id: Date.now(), text, role: 'user' }])
  }, [])

  return { events, addUserMessage }
}
