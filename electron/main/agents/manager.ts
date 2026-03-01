import type { Agent, AgentSession, AgentStartOptions } from './index'

export class AgentSessionManager {
  private sessions = new Map<string, AgentSession>()

  start(id: string, agent: Agent, options: Omit<AgentStartOptions, 'id' | 'onDone'>, onDone?: () => void): void {
    const existing = this.sessions.get(id)
    if (existing) {
      existing.stop()
      this.sessions.delete(id)
    }
    const session = agent.start({
      ...options,
      id,
      onDone: () => {
        this.sessions.delete(id)
        onDone?.()
      },
    })
    this.sessions.set(id, session)
  }

  send(id: string, message: string): void {
    this.sessions.get(id)?.sendMessage(message)
  }

  stop(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.stop()
      this.sessions.delete(id)
    }
  }

  stopAll(): void {
    for (const session of this.sessions.values()) {
      session.stop()
    }
    this.sessions.clear()
  }
}
