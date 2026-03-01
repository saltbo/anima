import { NavLink, useParams } from 'react-router-dom'
import { cn, statusBgColor, statusLabel, statusColor } from '@/lib/utils'
import { useProjects } from '@/store/projects'

const TABS = [
  { label: 'Dashboard', path: '' },
  { label: 'Milestones', path: '/milestones' },
  { label: 'Inbox', path: '/inbox' },
  { label: 'Settings', path: '/settings' },
]

export function ProjectHeader() {
  const { id } = useParams<{ id: string }>()
  const { projects, selectedProject } = useProjects()
  const project = selectedProject ?? projects.find((p) => p.id === id) ?? null

  return (
    <div
      className="border-b border-border bg-background shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Row 1: Project name + status | path + age */}
      <div
        className="flex items-center gap-2.5 px-5 h-10"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {project && (
          <>
            <span className={cn('w-2 h-2 rounded-full shrink-0', statusBgColor(project.status))} />
            <span className="text-sm font-semibold text-foreground">
              {project.name}
            </span>
            <span className={cn('text-xs font-medium', statusColor(project.status))}>
              {statusLabel(project.status)}
            </span>
          </>
        )}
      </div>

      {/* Row 2: Tabs */}
      <div
        className="flex items-center px-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/projects/${id}${tab.path}`}
            end={tab.path === ''}
            className={({ isActive }) =>
              cn(
                'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
