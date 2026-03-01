import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useProjects } from '@/store/projects'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { setSelectedProjectId } = useProjects()

  const handleView = () => {
    setSelectedProjectId(project.id)
    navigate(`/projects/${project.id}`)
  }

  const actionLabel = (): string | null => {
    switch (project.status) {
      case 'sleeping': return 'Wake Now'
      case 'awake': return 'Pause'
      case 'paused': return 'Resume'
      default: return null  // checking / rate_limited: no secondary action
    }
  }

  return (
    <Card className="flex flex-col hover:border-white/20 transition-colors">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{project.name}</CardTitle>
          <StatusBadge status={project.status} />
        </div>
        <CardDescription className="truncate text-xs">{project.path}</CardDescription>
      </CardHeader>

      <CardContent className="px-4 pb-2 flex-1 text-xs text-muted-foreground space-y-1">
        {project.currentMilestone && (
          <div>
            Milestone: <span className="text-foreground">{project.currentMilestone}</span>
          </div>
        )}
        {project.status === 'awake' && project.round > 0 && (
          <div>
            Round: <span className="text-foreground">{project.round}</span>
          </div>
        )}
        {project.status === 'sleeping' && project.nextWakeTime && (
          <div>
            Next check:{' '}
            <span className="text-foreground">
              {new Date(project.nextWakeTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}
        {project.status === 'paused' && (
          <div className="text-status-paused">Needs intervention</div>
        )}
      </CardContent>

      <CardFooter className="px-4 pb-4 gap-2">
        <Button
          variant="secondary"
          size="sm"
          className={cn('flex-1', !actionLabel() && 'flex-none w-full')}
          onClick={handleView}
        >
          View
        </Button>
        {actionLabel() && (
          <Button
            size="sm"
            className={cn(
              'flex-1',
              project.status === 'paused'
                ? 'bg-status-awake/10 hover:bg-status-awake/20 text-status-awake border-0'
                : ''
            )}
            variant={project.status === 'paused' ? 'outline' : 'default'}
          >
            {actionLabel()}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center text-3xl">
        ✦
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-foreground">All Projects</h1>
        <Button size="sm" variant="secondary" onClick={handleAdd}>
          <Plus size={12} className="mr-1.5" />
          Add Project
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        {/* Add Project card */}
        <button
          onClick={handleAdd}
          className="border border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors min-h-[140px]"
        >
          <Plus size={20} />
          <span className="text-sm font-medium">Add Project</span>
        </button>
      </div>
    </div>
  )
}
