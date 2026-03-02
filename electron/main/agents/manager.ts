import { EventEmitter } from 'events'
import type { Agent, AgentEvent, AgentSession, AgentStartOptions } from './index'

interface ManagedEntry {
  session: AgentSession
  listeners: Set<(event: AgentEvent) => void>
  unsubEvents: () => void
}

export class AgentManager extends EventEmitter {
  private entries = new Map<string, ManagedEntry>()
  /** Keeps session references after stop/done so readEvents() still works. */
  private completed = new Map<string, AgentSession>()

  start(
    agentKey: string,
    agent: Agent,
    options: Omit<AgentStartOptions, 'onEvent' | 'onDone'> & {
      onEvent?: (event: AgentEvent) => void
      onDone?: () => void
    }
  ): void {
    this.stop(agentKey) // clean up any existing session for this key

    const listeners = new Set<(event: AgentEvent) => void>()
    if (options.onEvent) listeners.add(options.onEvent)

    const session = agent.start({
      projectPath: options.projectPath,
      systemPrompt: options.systemPrompt,
      sessionId: options.sessionId,
      onSpawn: options.onSpawn,
      onEvent: (event) => {
        for (const listener of [...listeners]) listener(event)
        // Forward events to UI in real-time
        this.emit('events', agentKey, [event])
      },
      onDone: () => {
        const entry = this.entries.get(agentKey)
        if (entry) {
          entry.unsubEvents()
          this.completed.set(agentKey, entry.session)
          this.entries.delete(agentKey)
        }
        options.onDone?.()
      },
    })

    // File watcher is kept only for readEvents() history; real-time streaming uses stdout above
    const unsubEvents = session.onEvents(() => {})

    this.entries.set(agentKey, { session, listeners, unsubEvents })
  }

  /** Add a process-event listener to a running session (used by continue()). Returns cleanup fn. */
  addProcessListener(agentKey: string, listener: (event: AgentEvent) => void): () => void {
    const entry = this.entries.get(agentKey)
    if (entry) entry.listeners.add(listener)
    return () => { this.entries.get(agentKey)?.listeners.delete(listener) }
  }

  readEvents(agentKey: string): AgentEvent[] {
    const session = this.entries.get(agentKey)?.session ?? this.completed.get(agentKey)
    return session?.readEvents() ?? []
  }

  send(agentKey: string, message: string): void {
    this.entries.get(agentKey)?.session.sendMessage(message)
    // Emit user message immediately so the UI shows it without waiting for file watcher
    this.emit('events', agentKey, [{ event: 'text', role: 'user', text: message } as AgentEvent])
  }

  stop(agentKey: string): void {
    const entry = this.entries.get(agentKey)
    if (!entry) return
    entry.unsubEvents()
    this.completed.set(agentKey, entry.session)
    entry.session.stop()
    this.entries.delete(agentKey)
  }

  stopAll(): void {
    for (const [key] of this.entries) this.stop(key)
  }
}
