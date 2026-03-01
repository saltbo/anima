import { NavLink, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Dashboard', path: '' },
  { label: 'Milestones', path: '/milestones' },
  { label: 'Inbox', path: '/inbox' },
  { label: 'Settings', path: '/settings' },
]

export function ProjectTabs() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="flex items-center gap-1 px-4 border-b border-border bg-background">
      {TABS.map((tab) => (
        <NavLink
          key={tab.label}
          to={`/projects/${id}${tab.path}`}
          end={tab.path === ''}
          className={({ isActive }) =>
            cn(
              'px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
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
  )
}
