import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Zap, DollarSign, AlertTriangle, Activity, Flag, ClipboardList,
  Play, Moon, ArrowRight, Code, ShieldCheck, Sparkles, ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/store/projects'
import { cn, statusBgColor, statusColor, statusLabel } from '@/lib/utils'
import { formatTokens, formatTime, timeAgo } from '@/lib/time'
import type { Action, StatusChangedDetail, AgentStartedDetail, Milestone, BacklogItem } from '@/types/index'

export function ProjectDashboard() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const navigate = useNavigate()
  const project = projects.find((p) => p.id === id)
  const [svStatus, setSvStatus] = useState<{ hasSoul: boolean } | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([])

  useEffect(() => {
    if (!project) return
    window.electronAPI.checkProjectSetup(project.path).then(setSvStatus)
    window.electronAPI.getActionsByProject(project.id, 20).then(setActions)
    window.electronAPI.getMilestones(project.id).then(setMilestones)
    window.electronAPI.getBacklogItems(project.id).then(setBacklogItems)
  }, [project])

  if (!project) {
    return <div className="py-6 text-muted-foreground">Project not found.</div>
  }

  const completedMilestones = milestones.filter((m) => m.status === 'completed' || m.status === 'closed').length
  const totalIterations = milestones.reduce((sum, m) => sum + m.iterationCount, 0)
  const openBacklog = backlogItems.filter((i) => i.status === 'todo' || i.status === 'in_progress').length

  return (
    <div className="py-6 space-y-5">

      {/* Soul setup banner — only when not configured */}
      {svStatus && !svStatus.hasSoul && (
        <button
          onClick={() => navigate(`/projects/${id}/soul`)}
          className="w-full flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-left hover:bg-primary/10 transition-colors group"
        >
          <Sparkles size={16} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Configure Soul to get started</p>
            <p className="text-xs text-muted-foreground">Give your project a soul so Anima can drive it forward.</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </button>
      )}

      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusBgColor(project.status))} />
          <span className={cn('text-sm font-semibold', statusColor(project.status))}>
            {statusLabel(project.status)}
          </span>
          <span className="text-xs text-muted-foreground">
            {project.status === 'busy' && project.currentIteration && (
              <>&mdash; Round {project.currentIteration.round} in progress</>
            )}
            {project.status === 'sleeping' && project.nextWakeTime && (
              <>&mdash; Next check at {formatTime(project.nextWakeTime)}</>
            )}
            {project.status === 'sleeping' && !project.nextWakeTime && <>&mdash; No wake schedule</>}
            {project.status === 'idle' && <>&mdash; Waiting for work</>}
            {project.status === 'rate_limited' && <>&mdash; Will resume automatically</>}
          </span>
          {project.status === 'paused' && (
            <span className="flex items-center gap-1 text-xs text-status-paused font-medium">
              <AlertTriangle size={12} />
              Needs intervention
            </span>
          )}
        </div>
        {project.status !== 'busy' && project.status !== 'idle' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 cursor-pointer"
            onClick={() => window.electronAPI.wakeProject(project.id)}
          >
            <Play size={11} />
            Wake
          </Button>
        )}
        {(project.status === 'idle' || project.status === 'busy') && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 cursor-pointer"
            onClick={() => window.electronAPI.sleepProject(project.id)}
          >
            <Moon size={11} />
            Sleep
          </Button>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard icon={Zap} label="Tokens" value={formatTokens(project.totalTokens)} />
        <StatCard icon={DollarSign} label="Cost" value={project.totalCost > 0 ? `$${project.totalCost.toFixed(2)}` : '—'} />
        <StatCard icon={Flag} label="Milestones" value={`${completedMilestones}/${milestones.length}`} />
        <StatCard icon={RefreshCw} label="Iterations" value={totalIterations > 0 ? String(totalIterations) : '—'} />
        <StatCard icon={ClipboardList} label="Backlog" value={openBacklog > 0 ? String(openBacklog) : '—'} />
      </div>

      {/* Activity */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Activity</p>
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 text-center py-12">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Activity size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Activity will appear here once your project starts running.
            </p>
          </div>
        ) : (
          <ActivityFeed actions={actions} />
        )}
      </div>

    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Icon size={12} />
        {label}
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
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
                  round #{detail.iterationRound}
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
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className={cn('flex items-center justify-center w-5 h-5 rounded-full shrink-0', bgClass)}>
          <Icon size={11} className={iconClass} />
        </div>
        {showLine && <div className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex-1 min-w-0 pb-3 pt-0.5">
        {children}
      </div>
    </div>
  )
}
