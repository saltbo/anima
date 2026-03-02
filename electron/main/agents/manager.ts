import type { Agent, AgentSession, AgentStartOptions } from './index'

export class AgentManager {
  private sessions = new Map<string, AgentSession>()

  start(agentKey: string, agent: Agent, options: Omit<AgentStartOptions, 'onDone'>, onDone?: () => void): void {
    const existing = this.sessions.get(agentKey)
    if (existing) {
      existing.stop()
      this.sessions.delete(agentKey)
    }
    const session = agent.start({
      ...options,
      onDone: () => {
        this.sessions.delete(agentKey)
        onDone?.()
      },
    })
    this.sessions.set(agentKey, session)
  }

  send(agentKey: string, message: string): void {
    this.sessions.get(agentKey)?.sendMessage(message)
  }

  stop(agentKey: string): void {
    const session = this.sessions.get(agentKey)
    if (session) {
      session.stop()
      this.sessions.delete(agentKey)
    }
  }

  stopAll(): void {
    for (const session of this.sessions.values()) {
      session.stop()
    }
    this.sessions.clear()
  }
}
