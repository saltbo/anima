import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useProjects } from '@/store/projects'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { setSelectedProjectId } = useProjects()

  const handleView = () => {
    setSelectedProjectId(project.id)
    navigate(`/projects/${project.id}`)
  }

  const actionLabel = () => {
    switch (project.status) {
      case 'sleeping': return 'Wake Now'
      case 'awake': return 'Pause'
      case 'paused': return 'Resume'
      default: return 'View'
    }
  }

  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-4 flex flex-col gap-3 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-app-text-primary">{project.name}</h3>
          <p className="text-xs text-app-text-secondary mt-0.5 truncate max-w-[180px]">{project.path}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div className="text-xs text-app-text-secondary space-y-1">
        {project.currentMilestone && (
          <div>Milestone: <span className="text-app-text-primary">{project.currentMilestone}</span></div>
        )}
        {project.status === 'awake' && project.round > 0 && (
          <div>Round: <span className="text-app-text-primary">{project.round}</span></div>
        )}
        {project.status === 'sleeping' && project.nextWakeTime && (
          <div>
            Next check:{' '}
            <span className="text-app-text-primary">
              {new Date(project.nextWakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
        {project.status === 'paused' && (
          <div className="text-status-paused">Needs intervention</div>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <button
          onClick={handleView}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-app-text-primary transition-colors"
        >
          View
        </button>
        <button
          className={cn(
            'flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors',
            project.status === 'paused'
              ? 'bg-status-awake/10 hover:bg-status-awake/20 text-status-awake'
              : 'bg-app-accent/10 hover:bg-app-accent/20 text-app-accent'
          )}
        >
          {actionLabel()}
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-app-surface border border-app-border flex items-center justify-center text-3xl">
        ✦
      </div>
      <div>
        <h2 className="text-lg font-semibold text-app-text-primary">Add your first project</h2>
        <p className="text-sm text-app-text-secondary mt-1">
          Give your project a soul and let Anima drive it forward.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-app-accent hover:bg-app-accent/90 text-white text-sm font-medium transition-colors"
      >
        <Plus size={14} />
        Add your first project
      </button>
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-app-text-primary">All Projects</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-app-accent/10 hover:bg-app-accent/20 text-app-accent text-xs font-medium transition-colors"
        >
          <Plus size={12} />
          Add Project
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        {/* Add Project card */}
        <button
          onClick={handleAdd}
          className="border border-dashed border-app-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-app-text-secondary hover:border-app-accent hover:text-app-accent transition-colors min-h-[140px]"
        >
          <Plus size={20} />
          <span className="text-sm font-medium">Add Project</span>
        </button>
      </div>
    </div>
  )
}
