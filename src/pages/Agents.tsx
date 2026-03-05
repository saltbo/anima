import { useState, useEffect } from 'react'
import { Bot, ClipboardList, Code2, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface AgentInfo {
  id: string
  name: string
  description: string
}

const AGENT_ICONS: Record<string, LucideIcon> = {
  planner: ClipboardList,
  developer: Code2,
  reviewer: Search,
}

function AgentCard({ agent }: { agent: AgentInfo }) {
  const Icon = AGENT_ICONS[agent.id] ?? Bot

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon size={20} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
          <span className="inline-block mt-1 text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {agent.id}
          </span>
          <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
            {agent.description}
          </p>
        </div>
      </div>
    </div>
  )
}

export function Agents() {
  const [agents, setAgents] = useState<AgentInfo[]>([])

  useEffect(() => {
    window.electronAPI.getAgents().then(setAgents)
  }, [])

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Built-in agents that power project automation.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}
