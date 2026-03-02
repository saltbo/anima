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
      onEvent: (event) => {
        for (const listener of [...listeners]) listener(event)
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

    const unsubEvents = session.onEvents((events) => {
      this.emit('events', agentKey, events)
    })

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
