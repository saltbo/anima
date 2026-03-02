import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Settings } from 'lucide-react'
import { cn, statusBgColor } from '@/lib/utils'
import { useProjects } from '@/store/projects'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 h-8 rounded-md text-left transition-colors cursor-pointer',
        isSelected
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusBgColor(project.status))} />
      <span className="flex-1 text-sm font-medium truncate">{project.name}</span>
    </button>
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
      {/* macOS traffic light safe area + app name */}
      <div
        className="h-[52px] flex items-end px-4 pb-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          onClick={handleClickLogo}
          className="text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          Anima
        </button>
      </div>

      {/* Projects section header */}
      <div className="px-3 pt-2 pb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Projects
        </span>
        <button
          onClick={handleAddProject}
          title="Add Project"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Plus size={11} />
        </button>
      </div>

      {/* Project list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-0.5 space-y-0.5">
          {projects.length === 0 ? (
            <p className="px-3 py-6 text-xs text-muted-foreground/60 text-center">No projects yet</p>
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

      {/* Settings */}
      <div className="px-2 py-2 border-t border-border">
        <button
          onClick={() => {
            setSelectedProjectId(null)
            navigate('/settings')
          }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 h-8 rounded-md text-left transition-colors cursor-pointer',
            isSettingsActive
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <Settings size={14} />
          <span className="text-sm font-medium">Settings</span>
        </button>
      </div>
    </div>
  )
}
