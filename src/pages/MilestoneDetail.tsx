import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Trash2, CheckCircle2, Circle, XCircle, ArrowRight, Loader2, Save,
  Activity, Ban, Pencil, Zap, Moon, Pause, AlertTriangle, CheckCircle, Clock,
  GitBranch, MessageSquare, RotateCcw, Check,
} from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/store/theme'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { milestoneStatusLabel, milestoneStatusBadgeClass, milestoneStatusDotClass } from '@/lib/utils'
import { useProjects } from '@/store/projects'
import { AgentChat } from '@/components/AgentChat'
import { timeAgo, formatElapsed, formatTime, nowISO } from '@/lib/time'
import type { ProjectIterationStatus } from '@/types/electron.d'
import type { Milestone, InboxItem, ProjectStatus, Iteration, IterationOutcome, MilestoneComment, MilestoneGitInfo, MilestoneAction } from '@/types/index'

const TYPE_STYLES: Record<string, string> = {
  idea: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  bug: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
  feature: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20',
}

// ── Iteration helpers (from IterationMonitor) ────────────────────────────────

function StatusIcon({ status }: { status: ProjectStatus }) {
  switch (status) {
    case 'awake': return <Zap size={13} className="text-green-400" />
    case 'checking': return <Loader2 size={13} className="text-yellow-400 animate-spin" />
    case 'sleeping': return <Moon size={13} className="text-muted-foreground" />
    case 'paused': return <Pause size={13} className="text-orange-400" />
    case 'rate_limited': return <AlertTriangle size={13} className="text-red-400" />
    default: return <Moon size={13} className="text-muted-foreground" />
  }
}

function iterationStatusLabel(s: ProjectIterationStatus): string {
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
        ? `Rate limited · Resumes ${formatTime(s.rateLimitResetAt)}`
        : 'Rate limited'
    default: return s.status
  }
}

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



function outcomeLabel(outcome?: IterationOutcome): string {
  switch (outcome) {
    case 'passed': return 'Passed'
    case 'rejected': return 'Rejected'
    case 'cancelled': return 'Cancelled'
    case 'rate_limited': return 'Rate Limited'
    case 'error': return 'Error'
    default: return 'In Progress'
  }
}

// Special index for the live running entry that isn't yet in iterations[]
const LIVE_INDEX = -1

type Tab = 'overview' | 'iterations'

// ── Main component ───────────────────────────────────────────────────────────

export function MilestoneDetail() {
  const { id, mid } = useParams<{ id: string; mid: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { resolvedTheme } = useTheme()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const activeTab = (searchParams.get('tab') as Tab) || 'overview'
  const setActiveTab = (tab: Tab) => setSearchParams(tab === 'overview' ? {} : { tab })

  // ── Overview state ─────────────────────────────────────────────────────────
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [requestChangesOpen, setRequestChangesOpen] = useState(false)
  const [requestChangesText, setRequestChangesText] = useState('')
  const [comments, setComments] = useState<MilestoneComment[]>([])
  const [gitInfo, setGitInfo] = useState<MilestoneGitInfo | null>(null)
  const [markdownContent, setMarkdownContent] = useState('')
  const [savingMarkdown, setSavingMarkdown] = useState(false)

  // ── Iteration state (from IterationMonitor) ────────────────────────────────
  const [status, setStatus] = useState<ProjectIterationStatus>(() => ({
    projectId: id ?? '',
    status: project?.status ?? 'sleeping',
    currentIteration: project?.currentIteration ?? null,
    rateLimitResetAt: project?.rateLimitResetAt ?? null,
  }))
  const [activeAgent, setActiveAgent] = useState<'developer' | 'acceptor' | null>(null)
  const [iterations, setIterations] = useState<Iteration[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [agentSubTab, setAgentSubTab] = useState<'developer' | 'acceptor'>('developer')

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!project) return
    Promise.all([
      window.electronAPI.getMilestones(project.id),
      window.electronAPI.getInboxItems(project.id),
      window.electronAPI.readMilestoneMarkdown(project.id, mid!),
      window.electronAPI.getMilestoneComments(mid!),
    ]).then(([milestones, items, md, cmts]) => {
      const m = milestones.find((ms) => ms.id === mid) ?? null
      setMilestone(m)
      setIterations(m?.iterations ?? [])
      setMarkdownContent(md ?? '')
      setInboxItems(items)
      setComments(cmts)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, mid])

  // Load git info when milestone is in-progress or awaiting_review
  useEffect(() => {
    if (!project || !milestone) return
    if (milestone.status !== 'in-progress' && milestone.status !== 'awaiting_review') return
    window.electronAPI.getMilestoneGitStatus(project.id, milestone.id).then(setGitInfo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, milestone?.id, milestone?.status])

  useEffect(() => {
    return window.electronAPI.onMilestoneReviewDone((milestoneId) => {
      if (milestoneId !== mid || !project) return
      window.electronAPI.getMilestones(project.id).then((milestones) => {
        const m = milestones.find((ms) => ms.id === mid) ?? null
        setMilestone(m)
        if (m) setIterations(m.iterations ?? [])
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid, project?.id])

  // Sync status from project prop changes
  useEffect(() => {
    if (!project) return
    setStatus((prev) => ({
      ...prev,
      status: project.status,
      currentIteration: project.currentIteration,
      rateLimitResetAt: project.rateLimitResetAt,
    }))
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
        setMilestone(d.milestone)
        setIterations(d.milestone.iterations ?? [])
      })
    )

    return () => cleanups.forEach((c) => c())
  }, [id, mid])

  // ── Derived iteration state ────────────────────────────────────────────────
  const currentIter = status.currentIteration
  const isCurrentMilestone = currentIter?.milestoneId === mid

  const liveAlreadyRecorded = isCurrentMilestone && currentIter?.startedAt
    ? iterations.some((i) => i.startedAt === currentIter.startedAt)
    : true

  // Auto-select live iteration
  useEffect(() => {
    if (activeTab !== 'iterations') return
    if (isCurrentMilestone && currentIter && !liveAlreadyRecorded) {
      setSelectedIdx(LIVE_INDEX)
    } else if (isCurrentMilestone && currentIter && liveAlreadyRecorded) {
      const idx = iterations.findIndex((i) => i.startedAt === currentIter.startedAt)
      if (idx !== -1) setSelectedIdx(idx)
    } else if (iterations.length > 0 && selectedIdx === null) {
      setSelectedIdx(iterations.length - 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isCurrentMilestone, currentIter, liveAlreadyRecorded, iterations.length])

  // Migrate selection from LIVE_INDEX to recorded index
  useEffect(() => {
    if (selectedIdx === LIVE_INDEX && liveAlreadyRecorded && currentIter?.startedAt) {
      const idx = iterations.findIndex((i) => i.startedAt === currentIter.startedAt)
      if (idx !== -1) setSelectedIdx(idx)
    }
  }, [selectedIdx, liveAlreadyRecorded, iterations, currentIter])

  // Auto-switch to the active agent's sub-tab
  useEffect(() => {
    if (activeAgent) setAgentSubTab(activeAgent)
  }, [activeAgent])

  // Build agent keys for live mode
  const lastKeysRef = useRef<{ dev: string; acc: string } | null>(null)
  if (currentIter && isCurrentMilestone) {
    lastKeysRef.current = {
      dev: `${id}:${mid}-dev-${currentIter.round}`,
      acc: `${id}:${mid}-acc-${currentIter.round}`,
    }
  }

  // Determine live vs history
  const isLive = selectedIdx === LIVE_INDEX && isCurrentMilestone && !!currentIter
  const selectedIteration = selectedIdx !== null && selectedIdx >= 0 ? iterations[selectedIdx] : undefined
  const isSelectedLive = isLive || (
    selectedIteration && isCurrentMilestone && currentIter &&
    selectedIteration.startedAt === currentIter.startedAt && status.status === 'awake'
  )

  let devProps: { agentKey?: string; sessionId?: string } = {}
  let accProps: { agentKey?: string; sessionId?: string } = {}

  if (isLive) {
    devProps = { agentKey: lastKeysRef.current?.dev }
    accProps = { agentKey: lastKeysRef.current?.acc }
  } else if (selectedIteration) {
    // If this iteration is still live, prefer agentKey for real-time updates
    if (isSelectedLive && lastKeysRef.current) {
      devProps = { agentKey: lastKeysRef.current.dev }
      accProps = { agentKey: lastKeysRef.current.acc }
    } else {
      devProps = { sessionId: selectedIteration.developerSessionId }
      accProps = { sessionId: selectedIteration.acceptorSessionId }
    }
  }

  // Build iteration entries for display
  interface IterationEntry {
    iteration: Iteration
    index: number
    live: boolean
  }

  const iterationEntries: IterationEntry[] = iterations.map((iter, idx) => ({
    iteration: iter,
    index: idx,
    live: false,
  }))

  if (isCurrentMilestone && currentIter && !liveAlreadyRecorded) {
    iterationEntries.push({
      iteration: currentIter,
      index: LIVE_INDEX,
      live: true,
    })
  }

  if (isCurrentMilestone && currentIter && liveAlreadyRecorded && status.status === 'awake') {
    const idx = iterations.findIndex((i) => i.startedAt === currentIter.startedAt)
    if (idx !== -1 && iterationEntries[idx]) iterationEntries[idx].live = true
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleMarkReady = async () => {
    if (!project || !milestone) return
    const action: MilestoneAction = milestone.status === 'reviewed' ? 'approve' : 'mark_ready'
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action })
    setMilestone({ ...milestone, status: 'ready' })
  }

  const handleSaveMarkdown = async () => {
    if (!project || !milestone) return
    setSavingMarkdown(true)
    await window.electronAPI.writeMilestoneMarkdown(project.id, milestone.id, markdownContent)
    setSavingMarkdown(false)
  }

  const handleDelete = async () => {
    if (!project || !milestone) return
    await window.electronAPI.deleteMilestone(project.id, milestone.id)
    navigate(`/projects/${id}/milestones`)
  }

  const handleCancel = async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'cancel' })
    setMilestone({ ...milestone, status: 'cancelled' })
    setCancelOpen(false)
  }

  const handleReopen = async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'reopen' })
    setMilestone({ ...milestone, status: 'draft' })
  }

  const handleWake = () => {
    if (id) window.electronAPI.wakeProject(id)
  }

  const handleCancelIteration = () => {
    if (!id || !mid || !project) return
    window.electronAPI.transitionMilestone(id, mid, { action: 'cancel' })
  }

  const handleAcceptMerge = async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'accept' })
    setMilestone({ ...milestone, status: 'completed', completedAt: nowISO() })
  }

  const handleRollback = async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'rollback' })
    setMilestone({ ...milestone, status: 'ready', iterationCount: 0 })
    setRollbackOpen(false)
  }

  const handleRequestChanges = async () => {
    if (!project || !milestone || !requestChangesText.trim()) return
    const commentId = crypto.randomUUID()
    await window.electronAPI.transitionMilestone(project.id, milestone.id, {
      action: 'request_changes',
      comment: { id: commentId, body: requestChangesText.trim() },
    })
    setComments([...comments, {
      id: commentId,
      milestoneId: milestone.id,
      body: requestChangesText.trim(),
      author: 'human',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }])
    setMilestone({ ...milestone, status: 'ready' })
    setRequestChangesText('')
    setRequestChangesOpen(false)
  }

  // Resolve which agent props to show based on sub-tab
  const activeSubProps = agentSubTab === 'developer' ? devProps : accProps

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-5 py-4 border-b border-border space-y-2 shrink-0">
          <div className="h-4 rounded-md bg-muted animate-pulse w-2/5" />
          <div className="h-3 rounded-md bg-muted animate-pulse w-3/5" />
        </div>
        <div className="flex-1 flex">
          <div className="flex-1 border-r border-border p-5 space-y-3">
            {[100, 85, 90, 70].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="w-72 p-4 space-y-3">
            {[60, 80, 50].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!milestone) {
    return <div className="p-6 text-sm text-muted-foreground">Milestone not found.</div>
  }

  const completedCount = milestone.tasks.filter((t) => t.completed).length
  const totalTasks = milestone.tasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0
  const allDone = completedCount === totalTasks && totalTasks > 0
  const sortedTasks = [...milestone.tasks].sort((a, b) => {
    if (a.completed === b.completed) return a.order - b.order
    return a.completed ? 1 : -1
  })
  const isDraft = milestone.status === 'draft'
  const isReviewing = milestone.status === 'reviewing'
  const isReviewed = milestone.status === 'reviewed'
  const isInProgress = milestone.status === 'in-progress'
  const isAwaitingReview = milestone.status === 'awaiting_review'
  const isReady = milestone.status === 'ready'
  const isCancelled = milestone.status === 'cancelled'

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header strip ──────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-border shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${milestoneStatusBadgeClass(milestone.status)}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${milestoneStatusDotClass(milestone.status)} ${isReviewing ? 'animate-pulse' : ''}`} />
              {milestoneStatusLabel(milestone.status)}
            </span>
            <span className="text-xs text-muted-foreground">Created {timeAgo(milestone.createdAt)}</span>
          </div>
          <h2 className="text-sm font-semibold text-foreground leading-snug">{milestone.title}</h2>
          {milestone.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{milestone.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {isDraft && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 cursor-pointer" onClick={handleSaveMarkdown} disabled={savingMarkdown}>
              {savingMarkdown ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </Button>
          )}
          {isDraft && (
            <Button size="sm" className="h-7 text-xs gap-1 cursor-pointer" onClick={handleMarkReady}>
              Mark as Ready <ArrowRight size={12} />
            </Button>
          )}
          {isReviewed && (
            <Button size="sm" className="h-7 text-xs gap-1 cursor-pointer" onClick={handleMarkReady}>
              Approve <ArrowRight size={12} />
            </Button>
          )}
          {isAwaitingReview && (
            <>
              <Button size="sm" className="h-7 text-xs gap-1.5 cursor-pointer bg-green-600 hover:bg-green-700 text-white" onClick={handleAcceptMerge}>
                <Check size={12} />
                Accept &amp; Merge
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer" onClick={() => setRequestChangesOpen(true)}>
                <MessageSquare size={12} />
                Request Changes
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => setRollbackOpen(true)}>
                <RotateCcw size={12} />
                Rollback
              </Button>
            </>
          )}
          {(isReady || isInProgress) && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => setCancelOpen(true)}>
              <Ban size={12} />
              Cancel
            </Button>
          )}
          {isCancelled && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer" onClick={handleReopen}>
                <Pencil size={12} />
                Reopen
              </Button>
              {milestone.baseCommit && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => setRollbackOpen(true)}>
                  <RotateCcw size={12} />
                  Rollback
                </Button>
              )}
            </>
          )}
          {!isReviewing && !isInProgress && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors duration-150 cursor-pointer px-1.5"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Reviewing banner ──────────────────────────────────── */}
      {isReviewing && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-yellow-500/20 bg-yellow-500/5 shrink-0">
          <Loader2 size={13} className="text-yellow-500 animate-spin shrink-0" />
          <span className="text-xs text-yellow-700 dark:text-yellow-400">AI review in progress…</span>
        </div>
      )}

      {/* ── Awaiting review banner ────────────────────────────── */}
      {isAwaitingReview && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-amber-500/20 bg-amber-500/5 shrink-0">
          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Awaiting human review
            {gitInfo && ` — ${gitInfo.commitCount} commit${gitInfo.commitCount !== 1 ? 's' : ''}, ${gitInfo.diffStats.filesChanged} file${gitInfo.diffStats.filesChanged !== 1 ? 's' : ''} changed (+${gitInfo.diffStats.insertions} / -${gitInfo.diffStats.deletions})`}
          </span>
        </div>
      )}

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-5 border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('iterations')}
          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'iterations'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity size={12} />
          Iterations
          {iterations.length > 0 && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{iterations.length}</span>
          )}
        </button>

        {/* Iteration controls in tab bar */}
        {activeTab === 'iterations' && isInProgress && (
          <div className="ml-auto flex items-center gap-2">
            {status.status === 'awake' && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950 cursor-pointer" onClick={handleCancelIteration}>
                <Ban size={12} />
                Cancel
              </Button>
            )}
            {status.status !== 'awake' && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer" onClick={handleWake}>
                <Zap size={12} />
                Wake Now
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Tab content ───────────────────────────────────────── */}
      {activeTab === 'overview' ? (
        /* ── Overview tab: two-column layout ─────────────────── */
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Markdown content */}
          <div className="flex-1 overflow-hidden flex flex-col border-r border-border" data-color-mode={resolvedTheme}>
            {isDraft ? (
              <MDEditor
                value={markdownContent}
                onChange={(v) => setMarkdownContent(v ?? '')}
                preview="edit"
                style={{ flex: 1, height: '100%' }}
                height="100%"
              />
            ) : (
              <div className="flex-1 overflow-y-auto p-5">
                {markdownContent
                  ? <MDEditor.Markdown source={markdownContent} className="!bg-transparent !text-sm" />
                  : <p className="text-sm text-muted-foreground italic">No content yet.</p>
                }
              </div>
            )}
          </div>

          {/* RIGHT: Sidebar */}
          <div className="w-72 shrink-0 overflow-y-auto">

            {/* Git info */}
            {gitInfo && (isInProgress || isAwaitingReview) && (
              <div className="border-b border-border p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Git</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <GitBranch size={12} className="text-muted-foreground shrink-0" />
                    <span className="font-mono text-foreground truncate">{gitInfo.branch}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {gitInfo.commitCount} commit{gitInfo.commitCount !== 1 ? 's' : ''} · {gitInfo.diffStats.filesChanged} file{gitInfo.diffStats.filesChanged !== 1 ? 's' : ''} changed
                  </div>
                  <div className="text-muted-foreground">
                    <span className="text-green-600 dark:text-green-400">+{gitInfo.diffStats.insertions}</span>
                    {' / '}
                    <span className="text-red-600 dark:text-red-400">-{gitInfo.diffStats.deletions}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Comments */}
            {comments.length > 0 && (
              <div className="border-b border-border p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Comments</p>
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-lg bg-muted/50 p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-medium text-foreground capitalize">{c.author}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                      </div>
                      <div data-color-mode={resolvedTheme}>
                        <MDEditor.Markdown source={c.body} className="!bg-transparent !text-xs" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Iterations summary card */}
            {iterations.length > 0 && (
              <div className="border-b border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Iterations</p>
                  <span className="text-[10px] text-muted-foreground">{iterations.length} round{iterations.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-1">
                  {[...iterations].reverse().map((iter) => (
                    <button
                      key={iter.round}
                      onClick={() => setActiveTab('iterations')}
                      className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <OutcomeBadge outcome={iter.outcome} />
                      <span className="font-medium text-foreground">Round {iter.round}</span>
                      <span className="text-muted-foreground ml-auto">{outcomeLabel(iter.outcome)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 space-y-5">

              {/* Tasks */}
              {totalTasks > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tasks</p>
                    <span className={`text-[10px] font-medium ${allDone ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                      {completedCount}/{totalTasks}
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="space-y-0.5 pt-1">
                    {sortedTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                        {task.completed
                          ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                          : <Circle size={13} className="text-muted-foreground shrink-0" />
                        }
                        <p className={`text-xs leading-snug ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {task.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Acceptance Criteria */}
              {milestone.acceptanceCriteria.length > 0 && (
                <section className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Acceptance Criteria</p>
                  <ul className="space-y-0.5">
                    {milestone.acceptanceCriteria.map((ac, i) => (
                      <li key={i} className="flex items-start gap-2.5 px-2.5 py-1.5">
                        {ac.status === 'passed' && <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />}
                        {ac.status === 'rejected' && <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />}
                        {ac.status === 'pending' && <Circle size={13} className="text-muted-foreground mt-0.5 shrink-0" />}
                        <p className={`text-xs leading-snug ${ac.status === 'pending' ? 'text-foreground' : 'text-muted-foreground'} ${ac.status === 'rejected' ? 'line-through' : ''}`}>
                          {ac.title}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Linked Inbox Items */}
              {inboxItems.filter((i) => i.milestoneId === milestone.id).length > 0 && (
                <section className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Linked Inbox Items</p>
                  <div className="space-y-1">
                    {inboxItems.filter((i) => i.milestoneId === milestone.id).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 py-1">
                        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
                          {item.type}
                        </span>
                        <span className="text-xs text-foreground">{item.title}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Iterations tab: sidebar + full-width agent panel ── */
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Iteration list sidebar */}
          <div className="w-44 shrink-0 border-r border-border bg-muted/10 overflow-y-auto flex flex-col">
            <div className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              Iterations
            </div>
            {iterationEntries.length === 0 ? (
              <div className="px-3 py-4 text-[10px] text-muted-foreground/50">
                No iterations yet
              </div>
            ) : (
              <div className="px-2 space-y-0.5 flex-1">
                {[...iterationEntries].reverse().map((entry) => {
                  const isSelected = selectedIdx === entry.index
                  return (
                    <button
                      key={entry.index === LIVE_INDEX ? 'live' : entry.index}
                      onClick={() => setSelectedIdx(entry.index)}
                      className={`flex items-center gap-2 w-full px-2.5 py-2 text-left text-xs rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      }`}
                    >
                      {entry.live ? (
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                      ) : (
                        <OutcomeBadge outcome={entry.iteration.outcome} />
                      )}
                      <span className="font-medium">#{entry.iteration.round}</span>
                      {entry.live && <span className="text-[10px] text-green-400 ml-auto">Live</span>}
                      {!entry.live && (
                        <span className="text-[10px] text-muted-foreground ml-auto">{formatElapsed(entry.iteration.startedAt, entry.iteration.completedAt)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Agent panel area */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {selectedIdx === null && iterationEntries.length === 0 ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
                <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center">
                  <Activity size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">No iterations yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Iterations will appear here once the milestone starts running.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Sub-tab bar: iteration info left, Dev/Acceptor right */}
                <div className="flex items-center border-b border-border shrink-0 bg-muted/10">
                  {/* Iteration info */}
                  {selectedIdx !== null && (
                    <div className="px-4 flex items-center gap-3 text-[10px] text-muted-foreground">
                      {(isLive ? currentIter : selectedIteration) && (
                        <>
                          <span className="font-semibold text-foreground">Round {(isLive ? currentIter : selectedIteration)!.round}</span>
                          <span>{formatElapsed(
                            (isLive ? currentIter : selectedIteration)!.startedAt,
                            (isLive ? currentIter : selectedIteration)!.completedAt,
                          )}</span>
                          {!isSelectedLive && selectedIteration?.outcome && (
                            <span className="flex items-center gap-1">
                              <OutcomeBadge outcome={selectedIteration.outcome} />
                              {outcomeLabel(selectedIteration.outcome)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Dev / Acceptor tabs */}
                  <div className="ml-auto flex items-center">
                    {(['developer', 'acceptor'] as const).map((role) => {
                      const isActive = agentSubTab === role
                      const isRoleActive = !!isSelectedLive && activeAgent === role
                      return (
                        <button
                          key={role}
                          onClick={() => setAgentSubTab(role)}
                          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                            isActive
                              ? 'border-primary text-foreground'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {isRoleActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          )}
                          {role === 'developer' ? 'Developer' : 'Acceptor'}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Full-width single agent panel */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  {activeSubProps.agentKey || activeSubProps.sessionId ? (
                    <AgentChat
                      key={activeSubProps.agentKey ?? activeSubProps.sessionId}
                      agentKey={activeSubProps.agentKey}
                      sessionId={activeSubProps.sessionId}
                      className="flex-1 min-h-0"
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/40">
                      {selectedIdx !== null ? 'Waiting for iteration to start…' : 'Select an iteration'}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Status bar */}
            {isInProgress && (
              <div className="flex items-center gap-2 px-5 py-2 border-t border-border bg-muted/10 shrink-0">
                <StatusIcon status={status.status} />
                <span className="text-[11px] text-muted-foreground">{iterationStatusLabel(status)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ─────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Milestone</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{milestone.title}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirmation dialog ─────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Milestone</DialogTitle>
            <DialogDescription>
              {isInProgress
                ? 'This will stop all running agents and cancel the current iteration. The milestone can be re-edited and restarted later.'
                : 'This will remove the milestone from the scheduler queue. You can re-edit and resubmit it later.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep Running</Button>
            <Button variant="destructive" onClick={handleCancel}>Cancel Milestone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Request Changes dialog ─────────────────────────────── */}
      <Dialog open={requestChangesOpen} onOpenChange={setRequestChangesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Describe what needs to be changed. The milestone will be set back to &quot;ready&quot; and the AI will incorporate your feedback in the next iteration.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={requestChangesText}
            onChange={(e) => setRequestChangesText(e.target.value)}
            placeholder="Describe the changes needed..."
            className="w-full h-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRequestChangesOpen(false)}>Cancel</Button>
            <Button onClick={handleRequestChanges} disabled={!requestChangesText.trim()}>Submit Feedback</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rollback confirmation dialog ────────────────────────── */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback Milestone</DialogTitle>
            <DialogDescription>
              This will reset the milestone branch to the base commit, discarding all changes made during iterations. The milestone will be set back to &quot;ready&quot; so it can be re-run.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRollbackOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRollback}>Rollback</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
