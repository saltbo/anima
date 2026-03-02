import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Clock, Zap, DollarSign, RefreshCw, AlertTriangle, Activity, ChevronRight, CheckCircle2, Circle, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/store/projects'
import { cn, statusBgColor, statusColor, statusLabel } from '@/lib/utils'

function formatDuration(addedAt: string): string {
  const ms = Date.now() - new Date(addedAt).getTime()
  const hours = Math.floor(ms / 3600000)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  return `${Math.floor(ms / 60000)}m`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n > 0 ? String(n) : '—'
}

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
  const [svStatus, setSvStatus] = useState<{ hasVision: boolean; hasSoul: boolean } | null>(null)

  useEffect(() => {
    if (!project) return
    window.electronAPI.checkProjectSetup(project.path).then(setSvStatus)
  }, [project])

  if (!project) {
    return <div className="p-6 text-muted-foreground">Project not found.</div>
  }

  return (
    <div className="p-6 space-y-4">

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
          {project.status !== 'awake' && project.status !== 'checking' && (
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
          {project.status === 'awake' && project.currentIteration && (
            <span>Round <span className="text-foreground font-medium">{project.currentIteration.round}</span> in progress</span>
          )}
          {project.status === 'sleeping' && project.nextWakeTime && (
            <span>Next check at <span className="text-foreground font-medium">
              {new Date(project.nextWakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span></span>
          )}
          {project.status === 'sleeping' && !project.nextWakeTime && (
            <span>Idle — no wake schedule configured</span>
          )}
          {project.status === 'checking' && <span>Scanning for changes...</span>}
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
        <StatCard icon={Clock} label="Alive" value={formatDuration(project.addedAt)} />
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

      {/* Soul & Vision card */}
      <button
        onClick={() => navigate(`/projects/${id}/soul-vision`)}
        className="w-full bg-card border border-border rounded-xl p-4 text-left hover:border-foreground/20 transition-colors group"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Soul & Vision</p>
          <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            {svStatus?.hasVision
              ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
              : <Circle size={13} className="text-muted-foreground/40 shrink-0" />
            }
            <span className={cn('text-sm', svStatus?.hasVision ? 'text-foreground' : 'text-muted-foreground')}>
              Vision
            </span>
          </div>
          <div className="flex items-center gap-2">
            {svStatus?.hasSoul
              ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
              : <Circle size={13} className="text-muted-foreground/40 shrink-0" />
            }
            <span className={cn('text-sm', svStatus?.hasSoul ? 'text-foreground' : 'text-muted-foreground')}>
              Soul
            </span>
          </div>
          {svStatus && (!svStatus.hasVision || !svStatus.hasSoul) && (
            <span className="ml-auto text-xs text-primary font-medium">Configure →</span>
          )}
        </div>
      </button>

      {/* Activity */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Activity</p>
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
      </div>

    </div>
  )
}
