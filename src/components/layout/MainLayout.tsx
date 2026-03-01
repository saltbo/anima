import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ProjectHeader } from './ProjectHeader'
import { useProjects } from '@/store/projects'

function isProjectRoute(pathname: string): boolean {
  return pathname.startsWith('/projects/')
}

export function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setSelectedProjectId } = useProjects()
  const showProjectHeader = isProjectRoute(location.pathname)

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
        {showProjectHeader && <ProjectHeader />}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
