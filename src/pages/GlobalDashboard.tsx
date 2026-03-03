import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Clock, Zap, DollarSign } from 'lucide-react'
import { useProjects } from '@/store/projects'
import { cn, statusBgColor, statusLabel } from '@/lib/utils'
import { formatElapsed, formatTokens, formatTime } from '@/lib/time'
import { Button } from '@/components/ui/button'
import type { Project } from '@/types'

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { setSelectedProjectId } = useProjects()

  const handleClick = () => {
    setSelectedProjectId(project.id)
    navigate(`/projects/${project.id}`)
  }

  return (
    <button
      onClick={handleClick}
      className="group text-left w-full rounded-xl border border-border bg-card hover:bg-accent/40 hover:border-foreground/20 transition-all cursor-pointer overflow-hidden"
    >
      {/* Main info */}
      <div className="p-4 pb-3">
        {/* Top row: name + status */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <span className="text-sm font-semibold text-foreground leading-tight">{project.name}</span>
          <span className={cn('flex items-center gap-1.5 text-xs font-medium shrink-0', `text-status-${project.status === 'rate_limited' ? 'rate-limited' : project.status}`)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', statusBgColor(project.status))} />
            {statusLabel(project.status)}
          </span>
        </div>

        {/* Path */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate">{project.path}</span>
        </div>

        {/* Status-specific info */}
        <div className="text-xs text-muted-foreground space-y-1">
          {project.currentIteration && (
            <div className="truncate">
              <span className="text-foreground/40">Milestone</span>
              {' '}
              <span className="text-foreground/80">{project.currentIteration.milestoneId}</span>
            </div>
          )}
          {project.status === 'sleeping' && project.nextWakeTime && (
            <div>
              <span className="text-foreground/40">Next check</span>
              {' '}
              <span className="text-foreground/80">
                {formatTime(project.nextWakeTime)}
              </span>
            </div>
          )}
          {project.status === 'paused' && (
            <div className="text-status-paused">Needs intervention</div>
          )}
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-4 py-2.5 border-t border-border/60 bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock size={10} className="shrink-0" />
          {formatElapsed(project.addedAt)}
        </span>
        <span className="flex items-center gap-1">
          <Zap size={10} className="shrink-0" />
          {formatTokens(project.totalTokens)}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <DollarSign size={10} className="shrink-0" />
          {project.totalCost.toFixed(2)}
        </span>
      </div>
    </button>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
        <FolderOpen size={28} className="text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Add your first project</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Give your project a soul and let Anima drive it forward.
        </p>
      </div>
      <Button onClick={onAdd}>
        <Plus size={14} className="mr-2" />
        Add your first project
      </Button>
    </div>
  )
}

export function GlobalDashboard() {
  const { projects, addProject, setSelectedProjectId } = useProjects()
  const navigate = useNavigate()

  const handleAdd = async () => {
    const project = await addProject()
    if (project) {
      setSelectedProjectId(project.id)
      navigate(`/projects/${project.id}`)
    }
  }

  if (projects.length === 0) {
    return <EmptyState onAdd={handleAdd} />
  }

  return (
    <div className="p-6">
      <div
        className="flex items-center justify-between mb-6"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h1 className="text-lg font-semibold text-foreground">All Projects</h1>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button size="sm" variant="secondary" onClick={handleAdd}>
            <Plus size={12} className="mr-1.5" />
            Add Project
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        <button
          onClick={handleAdd}
          className="border border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors min-h-[120px] cursor-pointer"
        >
          <Plus size={18} />
          <span className="text-sm font-medium">Add Project</span>
        </button>
      </div>
    </div>
  )
}
