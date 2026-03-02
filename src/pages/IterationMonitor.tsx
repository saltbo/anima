import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Zap, Moon, Loader2, Pause, AlertTriangle, Ban, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentChat } from '@/components/AgentChat'
import { useProjects } from '@/store/projects'
import type { ProjectIterationStatus } from '@/types/electron.d'
import type { ProjectState, Iteration, IterationOutcome, Milestone } from '@/types/index'

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
        ? `Round ${s.currentIteration.round}`
        : 'Working'
    case 'paused': return 'Paused — awaiting human review'
    case 'rate_limited':
      return s.rateLimitResetAt
        ? `Rate limited · Resumes ${new Date(s.rateLimitResetAt).toLocaleTimeString()}`
        : 'Rate limited'
    default: return s.status
  }
}

// ── Outcome helpers ──────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome?: IterationOutcome }) {
  switch (outcome) {
    case 'passed':
      return <CheckCircle size={11} className="text-green-400 shrink-0" />
    case 'rejected':
      return <XCircle size={11} className="text-orange-400 shrink-0" />
    case 'cancelled':
      return <Ban size={11} className="text-muted-foreground shrink-0" />
    case 'rate_limited':
      return <AlertTriangle size={11} className="text-red-400 shrink-0" />
    case 'error':
      return <XCircle size={11} className="text-red-400 shrink-0" />
    default:
      return <Clock size={11} className="text-muted-foreground shrink-0" />
  }
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function AgentPanel({ label, agentKey, sessionId, active }: {
  label: string
  agentKey?: string
  sessionId?: string
  active: boolean
}) {
  const hasContent = agentKey || sessionId
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
      {hasContent ? (
        <AgentChat
          key={agentKey ?? sessionId}
          agentKey={agentKey}
          sessionId={sessionId}
          className="flex-1 min-h-0"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/40 p-4">
          Waiting for iteration to start…
        </div>
      )}
    </div>
  )
}

// ── Sidebar item ─────────────────────────────────────────────────────────────

interface SidebarEntry {
  iteration: Iteration
  index: number
  live: boolean
}

function IterationItem({ entry, displayNum, selected, onClick }: {
  entry: SidebarEntry
  displayNum: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs rounded-lg transition-colors ${
        selected
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      {entry.live ? (
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
      ) : (
        <OutcomeBadge outcome={entry.iteration.outcome} />
      )}
      <span className="font-medium">#{displayNum}</span>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// Special index for the live running entry that isn't yet in iterations[]
const LIVE_INDEX = -1

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
  const [iterations, setIterations] = useState<Iteration[]>([])
  // Selected by array index (or LIVE_INDEX for the running entry)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  // Load iterations from milestone
  const loadIterations = useCallback(() => {
    if (!project || !mid) return
    window.electronAPI.getMilestones(project.path).then((milestones: Milestone[]) => {
      const m = milestones.find((ms) => ms.id === mid)
      if (m) setIterations(m.iterations ?? [])
    })
  }, [project, mid])

  useEffect(() => { loadIterations() }, [loadIterations])

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

  // Listen for status + agent + milestone events
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

    cleanups.push(
      window.electronAPI.onMilestoneUpdated((data) => {
        const d = data as { projectId: string; milestone: Milestone }
        if (d.milestone.id !== mid) return
        setIterations(d.milestone.iterations ?? [])
      })
    )

    return () => cleanups.forEach((c) => c())
  }, [id, mid])

  // Derived state
  const currentIter = status.currentIteration
  const isCurrentMilestone = currentIter?.milestoneId === mid

  // Is the live entry already recorded in iterations[]?
  // Compare by startedAt to match precisely
  const liveAlreadyRecorded = isCurrentMilestone && currentIter?.startedAt
    ? iterations.some((i) => i.startedAt === currentIter.startedAt)
    : true // no live entry → treat as "already recorded" so we don't show extra

  // Auto-select: when a new live entry appears, select it; on mount, select latest
  useEffect(() => {
    if (isCurrentMilestone && currentIter && !liveAlreadyRecorded) {
      setSelectedIdx(LIVE_INDEX)
    } else if (isCurrentMilestone && currentIter && liveAlreadyRecorded) {
      // Live iteration is in the array — find its index
      const idx = iterations.findIndex((i) => i.startedAt === currentIter.startedAt)
      if (idx !== -1) setSelectedIdx(idx)
    } else if (iterations.length > 0 && selectedIdx === null) {
      setSelectedIdx(iterations.length - 1)
    }
  }, [isCurrentMilestone, currentIter, liveAlreadyRecorded, iterations, selectedIdx])

  // When live iteration gets recorded into iterations[], migrate selection from LIVE_INDEX
  useEffect(() => {
    if (selectedIdx === LIVE_INDEX && liveAlreadyRecorded && currentIter?.startedAt) {
      const idx = iterations.findIndex((i) => i.startedAt === currentIter.startedAt)
      if (idx !== -1) setSelectedIdx(idx)
    }
  }, [selectedIdx, liveAlreadyRecorded, iterations, currentIter])

  // Determine live vs history mode
  const isLive = selectedIdx === LIVE_INDEX && isCurrentMilestone && !!currentIter
  const selectedIteration = selectedIdx !== null && selectedIdx >= 0 ? iterations[selectedIdx] : undefined

  // Build agent keys for live mode (must match MilestoneExecutor key format)
  const lastKeysRef = useRef<{ dev: string; acc: string } | null>(null)
  if (currentIter && isCurrentMilestone) {
    lastKeysRef.current = {
      dev: `${id}:${mid}-dev-${currentIter.round}`,
      acc: `${id}:${mid}-acc-${currentIter.round}`,
    }
  }

  // Resolve what to pass to AgentPanel
  let devProps: { agentKey?: string; sessionId?: string } = {}
  let accProps: { agentKey?: string; sessionId?: string } = {}

  if (isLive) {
    devProps = { agentKey: lastKeysRef.current?.dev }
    accProps = { agentKey: lastKeysRef.current?.acc }
  } else if (selectedIteration) {
    devProps = { sessionId: selectedIteration.developerSessionId }
    accProps = { sessionId: selectedIteration.acceptorSessionId }
  }

  // Build sidebar entries
  const sidebarEntries: SidebarEntry[] = iterations.map((iter, idx) => ({
    iteration: iter,
    index: idx,
    live: false,
  }))

  // Add live running entry if not yet recorded
  if (isCurrentMilestone && currentIter && !liveAlreadyRecorded) {
    sidebarEntries.push({
      iteration: currentIter,
      index: LIVE_INDEX,
      live: true,
    })
  }

  // Mark the live entry in the array (if it was already recorded but still running)
  if (isCurrentMilestone && currentIter && liveAlreadyRecorded && status.status === 'awake') {
    const idx = iterations.findIndex((i) => i.startedAt === currentIter.startedAt)
    if (idx !== -1 && sidebarEntries[idx]) sidebarEntries[idx].live = true
  }

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

      {/* Body: sidebar + panels */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Iteration sidebar */}
        <div className="w-40 shrink-0 border-r border-border bg-muted/10 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Iterations
          </div>
          {sidebarEntries.length === 0 && (
            <div className="px-2 py-3 text-[10px] text-muted-foreground/50">
              No iterations yet
            </div>
          )}
          {[...sidebarEntries].reverse().map((entry) => (
            <IterationItem
              key={entry.index === LIVE_INDEX ? 'live' : entry.index}
              entry={entry}
              displayNum={entry.iteration.round}
              selected={selectedIdx === entry.index}
              onClick={() => setSelectedIdx(entry.index)}
            />
          ))}
        </div>

        {/* Agent panels */}
        <div className="flex-1 grid grid-cols-2 gap-3 p-4 overflow-hidden min-h-0">
          <AgentPanel
            label="Developer Agent"
            agentKey={devProps.agentKey}
            sessionId={devProps.sessionId}
            active={!!isLive && activeAgent === 'developer'}
          />
          <AgentPanel
            label="Acceptor Agent"
            agentKey={accProps.agentKey}
            sessionId={accProps.sessionId}
            active={!!isLive && activeAgent === 'acceptor'}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-5 py-2 border-t border-border bg-muted/10 shrink-0">
        <StatusIcon status={status.status} />
        <span className="text-[11px] text-muted-foreground">{statusLabel(status)}</span>
      </div>
    </div>
  )
}
