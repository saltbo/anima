import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Settings } from 'lucide-react'
import { cn, statusIcon, statusColor } from '@/lib/utils'
import { useProjects } from '@/store/projects'
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
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
        isSelected
          ? 'bg-white/10 text-app-text-primary'
          : 'text-app-text-secondary hover:bg-white/5 hover:text-app-text-primary'
      )}
    >
      <span className={cn('text-sm', statusColor(project.status))}>
        {statusIcon(project.status)}
      </span>
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
    <div className="flex flex-col h-full bg-app-sidebar border-r border-app-border select-none">
      {/* Title bar safe area for macOS traffic lights */}
      <div className="h-[52px] flex items-end px-4 pb-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <button
          onClick={handleClickLogo}
          className="text-sm font-bold text-app-text-primary tracking-wide hover:text-app-accent transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ✦ Anima
        </button>
      </div>

      {/* Add Project button */}
      <div className="px-3 pb-2">
        <button
          onClick={handleAddProject}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-app-text-secondary hover:text-app-text-primary hover:bg-white/5 transition-colors border border-dashed border-app-border hover:border-app-accent"
        >
          <Plus size={12} />
          <span>Add Project</span>
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {projects.length === 0 ? (
          <p className="px-3 py-4 text-xs text-app-text-secondary text-center">
            No projects yet
          </p>
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

      {/* Global settings */}
      <div className="px-2 pb-4">
        <button
          onClick={() => navigate('/settings')}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
            isSettingsActive
              ? 'bg-white/10 text-app-text-primary'
              : 'text-app-text-secondary hover:bg-white/5 hover:text-app-text-primary'
          )}
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  )
}
