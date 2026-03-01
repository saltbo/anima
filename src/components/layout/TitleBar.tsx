import { StatusBadge } from '@/components/ui/StatusBadge'
import { useProjects } from '@/store/projects'

export function TitleBar() {
  const { selectedProject } = useProjects()

  return (
    <div
      className="h-[38px] flex items-center px-4 border-b border-border bg-background"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left space for macOS traffic lights */}
      <div className="w-[68px] shrink-0" />

      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {selectedProject ? (
          <>
            <span className="text-sm font-medium text-foreground">{selectedProject.name}</span>
            <StatusBadge status={selectedProject.status} />
          </>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">Anima</span>
        )}
      </div>
    </div>
  )
}
