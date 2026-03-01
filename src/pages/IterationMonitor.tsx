import { useParams } from 'react-router-dom'
import { Terminal } from 'lucide-react'

export function IterationMonitor() {
  const { mid } = useParams<{ id: string; mid: string }>()

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <h2 className="text-sm font-semibold text-foreground">Iteration Monitor — {mid}</h2>

      <div className="flex-1 grid grid-cols-2 gap-4">
        <AgentPanel label="Developer Agent" status="idle" />
        <AgentPanel label="Acceptor Agent" status="idle" />
      </div>
    </div>
  )
}

function AgentPanel({ label, status }: { label: string; status: string }) {
  return (
    <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground capitalize">{status}</span>
      </div>
      <div className="flex-1 p-4 font-mono text-xs text-muted-foreground">
        <p>Agent output will appear here during iteration (M4).</p>
      </div>
    </div>
  )
}
