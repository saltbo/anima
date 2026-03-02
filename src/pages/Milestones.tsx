import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Flag, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { milestoneStatusLabel, milestoneStatusBadgeClass, milestoneStatusDotClass } from '@/lib/utils'
import { useProjects } from '@/store/projects'
import type { Milestone, MilestoneStatus } from '@/types/index'

const STATUS_ORDER: MilestoneStatus[] = ['in-progress', 'reviewed', 'reviewing', 'ready', 'draft', 'cancelled', 'completed']

const GROUP_LABELS: Record<MilestoneStatus, string> = {
  'in-progress': 'In Progress',
  'reviewing': 'Under Review',
  'reviewed': 'Reviewed',
  'ready': 'Ready to Start',
  'draft': 'Drafts',
  'cancelled': 'Cancelled',
  'completed': 'Completed',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

export function Milestones() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!project) return
    window.electronAPI.getMilestones(project.path).then((ms) => {
      setMilestones(ms)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          <div className="h-7 w-28 rounded bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  const grouped = STATUS_ORDER.reduce<Partial<Record<MilestoneStatus, Milestone[]>>>((acc, status) => {
    const group = milestones.filter((m) => m.status === status)
    if (group.length > 0) acc[status] = group
    return acc
  }, {})

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Milestones</h2>
        <Button size="sm" onClick={() => navigate(`/projects/${id}/milestones/new`)}>
          <Plus size={12} className="mr-1.5" />
          New Milestone
        </Button>
      </div>

      {milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center">
            <Flag size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">No milestones yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create one to get started.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {STATUS_ORDER.map((status) => {
            const group = grouped[status]
            if (!group) return null
            return (
              <div key={status} className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {GROUP_LABELS[status]}
                </p>
                {group.map((m) => {
                  const completed = m.tasks.filter((t) => t.completed).length
                  const total = m.tasks.length
                  return (
                    <div
                      key={m.id}
                      onClick={() => navigate(`/projects/${id}/milestones/${m.id}`)}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors"
                    >
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${milestoneStatusDotClass(m.status)}`} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{m.title}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {m.status === 'in-progress' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/projects/${id}/milestones/${m.id}?tab=iterations`) }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-green-400 hover:bg-green-500/10 transition-colors"
                              >
                                <Activity size={10} />
                                Monitor
                              </button>
                            )}
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${milestoneStatusBadgeClass(m.status)}`}>
                              {milestoneStatusLabel(m.status)}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{m.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {completed}/{total} tasks completed · created {timeAgo(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
