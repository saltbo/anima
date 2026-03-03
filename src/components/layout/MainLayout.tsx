import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation, useMatches, Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useProjects } from '@/store/projects'
import type { RouteHandle, RouteMeta } from '@/types/router'

function Breadcrumb() {
  const matches = useMatches()
  const { selectedProject } = useProjects()

  if (!selectedProject) return null

  // Collect static crumb segments from route handles
  const crumbs: { label: string; path?: string }[] = []
  let metaTitle: string | null = null

  for (const match of matches) {
    const handle = match.handle as RouteHandle | undefined
    if (handle?.crumb) {
      for (const seg of handle.crumb) {
        crumbs.push(seg)
      }
    }
    const meta = (match.data as { meta?: RouteMeta } | null)?.meta
    if (meta?.title) {
      metaTitle = meta.title
    }
  }

  // Append dynamic title from loader meta; fall back to URL slug
  if (metaTitle) {
    crumbs.push({ label: metaTitle })
  } else {
    const last = matches[matches.length - 1]
    if (last?.data !== undefined) {
      const slug = last.pathname.split('/').pop() ?? ''
      if (slug) crumbs.push({ label: slug })
    }
  }

  if (crumbs.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 px-6 pb-4 text-sm text-muted-foreground shrink-0">
      <span className="font-medium text-foreground">{selectedProject.name}</span>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight size={14} />
          {crumb.path ? (
            <Link
              to={`/projects/${selectedProject.id}/${crumb.path}`}
              className="hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className={i === crumbs.length - 1 ? 'truncate max-w-[300px]' : ''}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

export function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setSelectedProjectId } = useProjects()

  // Sync selectedProjectId from URL (handles direct navigation, back/forward, refresh)
  useEffect(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/)
    if (match) {
      setSelectedProjectId(match[1])
    } else {
      setSelectedProjectId(null)
    }
  }, [location.pathname, setSelectedProjectId])

  // Listen for navigation events from main process (tray clicks, etc.)
  useEffect(() => {
    const cleanup = window.electronAPI.onNavigate((path) => {
      navigate(path)
      const match = path.match(/^\/projects\/([^/]+)/)
      if (match) {
        setSelectedProjectId(match[1])
      } else {
        setSelectedProjectId(null)
      }
    })
    return cleanup
  }, [navigate, setSelectedProjectId])

  // Listen for trigger-add-project from tray menu
  useEffect(() => {
    const cleanup = window.electronAPI.onTriggerAddProject(async () => {
      window.dispatchEvent(new Event('trigger-add-project'))
    })
    return cleanup
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-[220px] shrink-0">
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* macOS title bar drag region */}
        <div
          className="h-[52px] shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        <Breadcrumb />
        <div className="flex-1 overflow-auto px-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
