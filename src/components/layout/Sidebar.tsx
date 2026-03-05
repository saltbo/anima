import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  ChevronDown,
  Home,
  ClipboardList,
  LayoutDashboard,
  Flag,
  Plus,
  Settings,
  Sparkles,
  Bot,
} from 'lucide-react'
import { cn, statusBgColor } from '@/lib/utils'
import { useProjects } from '@/store/projects'
import type { Project } from '@/types'

const PROJECT_TABS = [
  { label: 'Dashboard', path: '', icon: LayoutDashboard },
  { label: 'Soul', path: '/soul', icon: Sparkles },
  { label: 'Milestones', path: '/milestones', icon: Flag },
  { label: 'Backlog', path: '/backlog', icon: ClipboardList },
  { label: 'Settings', path: '/settings', icon: Settings },
]

export function Sidebar() {
  const { projects, addProject, selectedProjectId, setSelectedProjectId, selectedProject } =
    useProjects()
  const navigate = useNavigate()
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [dropdownOpen])

  // Close dropdown on route change
  useEffect(() => {
    setDropdownOpen(false)
  }, [location.pathname])

  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id)
    setDropdownOpen(false)
    navigate(`/projects/${project.id}`)
  }

  const handleAddProject = async () => {
    setDropdownOpen(false)
    const project = await addProject()
    if (project) {
      setSelectedProjectId(project.id)
      navigate(`/projects/${project.id}`)
    }
  }

  const handleClickHome = () => {
    setSelectedProjectId(null)
    navigate('/')
  }

  const isGlobalSettingsActive = location.pathname === '/settings'
  const isAgentsActive = location.pathname === '/agents'

  return (
    <div className="flex flex-col h-full bg-app-sidebar border-r border-border select-none">
      {/* macOS traffic light safe area + project selector */}
      <div
        className="pt-[52px] px-3 pb-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div ref={dropdownRef} className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-left transition-colors cursor-pointer',
              'hover:bg-accent',
              selectedProject ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {selectedProject ? (
              <>
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    statusBgColor(selectedProject.status)
                  )}
                />
                <span className="flex-1 text-sm font-semibold truncate">
                  {selectedProject.name}
                </span>
              </>
            ) : (
              <span className="flex-1 text-sm font-semibold truncate">Anima</span>
            )}
            <ChevronDown
              size={14}
              className={cn(
                'shrink-0 text-muted-foreground transition-transform',
                dropdownOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute left-0 right-0 top-9 z-50 rounded-md border border-border bg-popover shadow-md py-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 h-8 text-left text-sm transition-colors cursor-pointer',
                    project.id === selectedProjectId
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      statusBgColor(project.status)
                    )}
                  />
                  <span className="flex-1 truncate">{project.name}</span>
                </button>
              ))}
              {projects.length > 0 && <div className="my-1 border-t border-border" />}
              <button
                onClick={handleAddProject}
                className="w-full flex items-center gap-2 px-3 h-8 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Project</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-border" />

      {/* Navigation */}
      <div className="flex-1 px-2 py-2 space-y-0.5">
        {selectedProject ? (
          PROJECT_TABS.map((tab) => (
            <NavLink
              key={tab.label}
              to={`/projects/${selectedProjectId}${tab.path}`}
              end={tab.path === ''}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 h-8 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <tab.icon size={16} />
              {tab.label}
            </NavLink>
          ))
        ) : (
          <>
            <button
              onClick={handleClickHome}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 h-8 rounded-md text-sm font-medium transition-colors cursor-pointer',
                !isGlobalSettingsActive && !isAgentsActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Home size={16} />
              Home
            </button>
            <button
              onClick={() => {
                setSelectedProjectId(null)
                navigate('/agents')
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 h-8 rounded-md text-sm font-medium transition-colors cursor-pointer',
                isAgentsActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Bot size={16} />
              Agents
            </button>
          </>
        )}
      </div>

      {/* Global Settings */}
      <div className="px-2 py-2 border-t border-border">
        <button
          onClick={() => {
            setSelectedProjectId(null)
            navigate('/settings')
          }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 h-8 rounded-md text-left transition-colors cursor-pointer',
            isGlobalSettingsActive
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <Settings size={14} />
          <span className="text-sm font-medium">Preferences</span>
        </button>
      </div>
    </div>
  )
}
