import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Zap, Moon, Loader2, Pause, AlertTriangle, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentChat } from '@/components/AgentChat'
import { useProjects } from '@/store/projects'
import type { ProjectIterationStatus } from '@/types/electron.d'
import type { ProjectState } from '@/types/index'

// ── Status bar helpers ────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ProjectState['status'] }) {
  switch (status) {
    case 'awake': return <Zap size={13} className="text-green-400" />
    case 'checking': return <Loader2 size={13} className="text-yellow-400 animate-spin" />
    case 'sleeping': return <Moon size={13} className="text-muted-foreground" />
    case 'paused': return <Pause size={13} className="text-orange-400" />
    case 'rate_limited': return <AlertTriangle size={13} className="text-red-400" />
    default: return <Moon size={13} className="text-muted-foreground" />
  }
}

function statusLabel(s: ProjectIterationStatus): string {
  switch (s.status) {
    case 'sleeping': return 'Sleeping'
    case 'checking': return 'Checking for milestones…'
    case 'awake':
      return s.currentIteration
        ? `Iteration ${s.currentIteration.count}`
        : 'Working'
    case 'paused': return 'Paused — awaiting human review'
    case 'rate_limited':
      return s.rateLimitResetAt
        ? `Rate limited · Resumes ${new Date(s.rateLimitResetAt).toLocaleTimeString()}`
        : 'Rate limited'
    default: return s.status
  }
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function AgentPanel({ label, agentKey, active }: {
  label: string
  agentKey: string | null
  active: boolean
}) {
  return (
    <div className={`flex flex-col border rounded-xl overflow-hidden transition-all ${active ? 'border-green-500/40 shadow-[0_0_12px_rgba(74,222,128,0.08)]' : 'border-border'}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20 shrink-0">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {active && (
          <span className="flex items-center gap-1.5 text-[10px] text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            active
          </span>
        )}
      </div>
      {agentKey ? (
        <AgentChat key={agentKey} agentKey={agentKey} className="flex-1 min-h-0" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/40 p-4">
          Waiting for iteration to start…
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function IterationMonitor() {
  const { id, mid } = useParams<{ id: string; mid: string }>()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [status, setStatus] = useState<ProjectIterationStatus>({
    projectId: id ?? '',
    status: 'sleeping',
    currentIteration: null,
    rateLimitResetAt: null,
  })
  const [activeAgent, setActiveAgent] = useState<'developer' | 'acceptor' | null>(null)

  // Load initial state
  useEffect(() => {
    if (!project) return
    window.electronAPI.getProjectState(project.path).then((state) => {
      setStatus((prev) => ({
        ...prev,
        status: state.status,
        currentIteration: state.currentIteration,
        rateLimitResetAt: state.rateLimitResetAt,
      }))
    })
  }, [project])

  // Listen for status + agent events
  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(
      window.electronAPI.onProjectStatusChanged((s) => {
        if (s.projectId !== id) return
        setStatus(s)
      })
    )

    cleanups.push(
      window.electronAPI.onProjectAgentEvent((data) => {
        if (data.projectId !== id) return
        setActiveAgent(data.role)
      })
    )

    return () => cleanups.forEach((c) => c())
  }, [id])

  // Derive agent keys from milestone ID + iteration count (internal routing keys for AgentChat)
  const devAgentKey = status.currentIteration ? `${mid}-dev-${status.currentIteration.count}` : null
  const accAgentKey = status.currentIteration ? `${mid}-acc-${status.currentIteration.count}` : null

  const handleWake = () => {
    if (id) window.electronAPI.wakeProject(id)
  }

  const handleCancel = () => {
    if (!id || !mid || !project) return
    window.electronAPI.cancelMilestone(id, project.path, mid)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground truncate">
          {mid ?? '—'}
        </span>
        <div className="flex items-center gap-2">
          {status.status === 'awake' && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950" onClick={handleCancel}>
              <Ban size={12} />
              Cancel
            </Button>
          )}
          {status.status !== 'awake' && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleWake}>
              <Zap size={12} />
              Wake Now
            </Button>
          )}
        </div>
      </div>

      {/* Agent panels */}
      <div className="flex-1 grid grid-cols-2 gap-3 p-4 overflow-hidden min-h-0">
        <AgentPanel
          label="Developer Agent"
          agentKey={devAgentKey}
          active={status.status === 'awake' && activeAgent === 'developer'}
        />
        <AgentPanel
          label="Acceptor Agent"
          agentKey={accAgentKey}
          active={status.status === 'awake' && activeAgent === 'acceptor'}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-5 py-2 border-t border-border bg-muted/10 shrink-0">
        <StatusIcon status={status.status} />
        <span className="text-[11px] text-muted-foreground">{statusLabel(status)}</span>
      </div>
    </div>
  )
}
