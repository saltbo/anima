import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Clock, Zap, DollarSign, RefreshCw, AlertTriangle, Activity, ChevronRight, CheckCircle2, Circle, Play, ArrowRight, Code, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/store/projects'
import { cn, statusBgColor, statusColor, statusLabel } from '@/lib/utils'
import { formatElapsed, formatTokens, formatTime, timeAgo } from '@/lib/time'
import type { Action, StatusChangedDetail, AgentStartedDetail } from '@/types/index'

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Icon size={11} />
        {label}
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}

export function ProjectDashboard() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const navigate = useNavigate()
  const project = projects.find((p) => p.id === id)
  const [svStatus, setSvStatus] = useState<{ hasSoul: boolean } | null>(null)
  const [actions, setActions] = useState<Action[]>([])

  useEffect(() => {
    if (!project) return
    window.electronAPI.checkProjectSetup(project.path).then(setSvStatus)
    window.electronAPI.getActionsByProject(project.id, 20).then(setActions)
  }, [project])

  if (!project) {
    return <div className="py-6 text-muted-foreground">Project not found.</div>
  }

  return (
    <div className="py-6 space-y-4">

      {/* Status card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className={cn('w-2 h-2 rounded-full shrink-0', statusBgColor(project.status))} />
            <span className={cn('text-sm font-semibold', statusColor(project.status))}>
              {statusLabel(project.status)}
            </span>
            {project.currentIteration && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-sm text-muted-foreground">{project.currentIteration.milestoneId}</span>
              </>
            )}
          </div>
          {project.status !== 'busy' && project.status !== 'idle' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 cursor-pointer"
              onClick={() => window.electronAPI.wakeProject(project.id)}
            >
              <Play size={12} />
              Wake Now
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {project.status === 'busy' && project.currentIteration && (
            <span>Round <span className="text-foreground font-medium">{project.currentIteration.round}</span> in progress</span>
          )}
          {project.status === 'sleeping' && project.nextWakeTime && (
            <span>Next check at <span className="text-foreground font-medium">
              {formatTime(project.nextWakeTime)}
            </span></span>
          )}
          {project.status === 'sleeping' && !project.nextWakeTime && (
            <span>Idle — no wake schedule configured</span>
          )}
          {project.status === 'idle' && <span>Soul is awake, waiting for work...</span>}
          {project.status === 'paused' && (
            <div className="flex items-center gap-1.5 text-status-paused">
              <AlertTriangle size={13} />
              Needs manual intervention
            </div>
          )}
          {project.status === 'rate_limited' && <span>Rate limited — will resume automatically</span>}
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={Clock} label="Alive" value={formatElapsed(project.addedAt)} />
        <StatCard icon={Zap} label="Tokens" value={formatTokens(project.totalTokens)} />
        <StatCard
          icon={DollarSign}
          label="Cost"
          value={project.totalCost > 0 ? `$${project.totalCost.toFixed(2)}` : '—'}
        />
        <StatCard
          icon={RefreshCw}
          label="Iteration"
          value={project.currentIteration ? String(project.currentIteration.round) : '—'}
        />
      </div>

      {/* Soul card */}
      <button
        onClick={() => navigate(`/projects/${id}/soul`)}
        className="w-full bg-card border border-border rounded-xl p-4 text-left hover:border-foreground/20 transition-colors group"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Soul</p>
          <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            {svStatus?.hasSoul
              ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
              : <Circle size={13} className="text-muted-foreground/40 shrink-0" />
            }
            <span className={cn('text-sm', svStatus?.hasSoul ? 'text-foreground' : 'text-muted-foreground')}>
              Soul
            </span>
          </div>
          {svStatus && !svStatus.hasSoul && (
            <span className="ml-auto text-xs text-primary font-medium">Configure →</span>
          )}
        </div>
      </button>

      {/* Activity */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Activity</p>
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-6">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <Activity size={16} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Activity will appear here once your project starts running.
              </p>
            </div>
          </div>
        ) : (
          <ActivityFeed actions={actions} />
        )}
      </div>

    </div>
  )
}

// ── Activity Feed ────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  human: 'You',
  planner: 'Planner',
  developer: 'Developer',
  reviewer: 'Reviewer',
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  developer: Code,
  reviewer: ShieldCheck,
  planner: Sparkles,
}

const AGENT_COLORS: Record<string, { icon: string; bg: string }> = {
  developer: { icon: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  reviewer: { icon: 'text-green-600', bg: 'bg-green-600/10' },
  planner: { icon: 'text-amber-500', bg: 'bg-amber-500/10' },
}

function statusActionLabel(detail: StatusChangedDetail): string {
  if (detail.action === 'create') return 'created milestone'
  if (detail.action === 'start_execution') return 'started execution'
  if (detail.action === 'approve') return 'approved milestone'
  if (detail.action === 'accept') return 'accepted milestone'
  if (detail.action === 'rollback') return 'rolled back milestone'
  if (detail.action === 'cancel') return 'cancelled milestone'
  if (detail.action === 'close') return 'closed milestone'
  return `${detail.from} \u2192 ${detail.to}`
}

function ActivityFeed({ actions }: { actions: Action[] }) {
  return (
    <div>
      {actions.map((action, idx) => {
        const isLast = idx === actions.length - 1

        if (action.type === 'status_changed' && action.detail) {
          const detail: StatusChangedDetail = JSON.parse(action.detail)
          return (
            <ActivityRow key={action.id} showLine={!isLast} icon={ArrowRight} iconClass="text-muted-foreground" bgClass="bg-muted">
              <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                <span className="text-xs font-medium text-foreground">
                  {AGENT_LABELS[action.actor] ?? action.actor}
                </span>
                <span className="text-xs text-muted-foreground">
                  {statusActionLabel(detail)}
                </span>
                {action.milestoneId && (
                  <span className="text-xs text-muted-foreground/70 font-mono truncate max-w-[120px]">
                    {action.milestoneId}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground/50 ml-auto shrink-0">
                  {timeAgo(action.createdAt)}
                </span>
              </div>
            </ActivityRow>
          )
        }

        if (action.type === 'agent_started' && action.detail) {
          const detail: AgentStartedDetail = JSON.parse(action.detail)
          const agentId = action.actor
          const Icon = AGENT_ICONS[agentId] ?? Code
          const colors = AGENT_COLORS[agentId] ?? { icon: 'text-muted-foreground', bg: 'bg-muted' }

          return (
            <ActivityRow key={action.id} showLine={!isLast} icon={Icon} iconClass={colors.icon} bgClass={colors.bg}>
              <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                <span className="text-xs font-medium text-foreground">
                  {AGENT_LABELS[agentId] ?? agentId}
                </span>
                <span className="text-xs text-muted-foreground">
                  started round #{detail.iterationRound}
                </span>
                <span className="text-[11px] text-muted-foreground/50 ml-auto shrink-0">
                  {timeAgo(action.createdAt)}
                </span>
              </div>
            </ActivityRow>
          )
        }

        return null
      })}
    </div>
  )
}

function ActivityRow({
  showLine,
  icon: Icon,
  iconClass,
  bgClass,
  children,
}: {
  showLine: boolean
  icon: React.ElementType
  iconClass: string
  bgClass: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3 min-h-[32px]">
      {/* Dot + line column */}
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className={cn('flex items-center justify-center w-5 h-5 rounded-full shrink-0', bgClass)}>
          <Icon size={11} className={iconClass} />
        </div>
        {showLine && <div className="w-px flex-1 bg-border" />}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-3 pt-0.5">
        {children}
      </div>
    </div>
  )
}
