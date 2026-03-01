import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Settings } from 'lucide-react'
import { cn, statusIcon, statusColor } from '@/lib/utils'
import { useProjects } from '@/store/projects'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { Project } from '@/types'

function ProjectItem({
  project,
  isSelected,
  onClick,
}: {
  project: Project
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        'w-full justify-start gap-2.5 px-3 h-9',
        isSelected ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
      )}
    >
      <span className={cn('text-sm shrink-0', statusColor(project.status))}>
        {statusIcon(project.status)}
      </span>
      <span className="flex-1 text-sm font-medium truncate text-left">{project.name}</span>
    </Button>
  )
}

export function Sidebar() {
  const { projects, addProject, selectedProjectId, setSelectedProjectId } = useProjects()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id)
    navigate(`/projects/${project.id}`)
  }

  const handleAddProject = async () => {
    const project = await addProject()
    if (project) {
      setSelectedProjectId(project.id)
      navigate(`/projects/${project.id}`)
    }
  }

  const handleClickLogo = () => {
    setSelectedProjectId(null)
    navigate('/')
  }

  const isSettingsActive = location.pathname === '/settings'

  return (
    <div className="flex flex-col h-full bg-app-sidebar border-r border-border select-none">
      {/* Title bar safe area for macOS traffic lights */}
      <div
        className="h-[52px] flex items-end px-4 pb-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          onClick={handleClickLogo}
          className="text-sm font-bold text-foreground tracking-wide hover:text-app-accent transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ✦ Anima
        </button>
      </div>

      {/* Add Project button */}
      <div className="px-3 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddProject}
          className="w-full justify-start gap-2 text-muted-foreground border-dashed hover:text-foreground hover:border-app-accent"
        >
          <Plus size={12} />
          Add Project
        </Button>
      </div>

      <Separator />

      {/* Project list */}
      <ScrollArea className="flex-1 py-2">
        <div className="px-2 space-y-0.5">
          {projects.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">No projects yet</p>
          ) : (
            projects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isSelected={selectedProjectId === project.id}
                onClick={() => handleSelectProject(project)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Global settings */}
      <div className="px-2 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
          className={cn(
            'w-full justify-start gap-2.5',
            isSettingsActive ? 'bg-secondary text-foreground' : 'text-muted-foreground'
          )}
        >
          <Settings size={14} />
          Settings
        </Button>
      </div>
    </div>
  )
}
