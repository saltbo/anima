import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { ProjectTabs } from './ProjectTabs'
import { useProjects } from '@/store/projects'

function isProjectRoute(pathname: string): boolean {
  return pathname.startsWith('/projects/')
}

export function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setSelectedProjectId } = useProjects()
  const showTabs = isProjectRoute(location.pathname)

  // Listen for navigation events from main process (tray clicks, etc.)
  useEffect(() => {
    const cleanup = window.electronAPI.onNavigate((path) => {
      navigate(path)
      // Extract project id from path
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
      // Dispatch a custom event that Sidebar listens to
      window.dispatchEvent(new Event('trigger-add-project'))
    })
    return cleanup
  }, [])

  return (
    <div className="flex h-screen bg-app-bg text-app-text-primary overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-[240px] shrink-0">
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TitleBar />
        {showTabs && <ProjectTabs />}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
