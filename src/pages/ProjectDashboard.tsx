import { useParams } from 'react-router-dom'
import { useProjects } from '@/store/projects'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function ProjectDashboard() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  if (!project) {
    return (
      <div className="p-6 text-app-text-secondary">Project not found.</div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Status">
          <StatusBadge status={project.status} />
        </MetricCard>
        <MetricCard label="Current Milestone">
          <span className="text-sm font-semibold text-app-text-primary">
            {project.currentMilestone ?? '—'}
          </span>
        </MetricCard>
        <MetricCard label="Current Round">
          <span className="text-sm font-semibold text-app-text-primary">
            {project.round > 0 ? project.round : '—'}
          </span>
        </MetricCard>
        <MetricCard label="Next Wake">
          <span className="text-sm font-semibold text-app-text-primary">
            {project.nextWakeTime
              ? new Date(project.nextWakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </MetricCard>
      </div>

      <div className="bg-app-surface border border-app-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-3">
          Project Path
        </h3>
        <p className="text-sm text-app-text-primary font-mono">{project.path}</p>
      </div>

      <div className="bg-app-surface border border-app-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-3">
          Activity
        </h3>
        <p className="text-sm text-app-text-secondary">
          No activity yet. Configure a wake schedule and add milestones to start.
        </p>
      </div>
    </div>
  )
}

function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-4">
      <div className="text-xs text-app-text-secondary mb-2">{label}</div>
      {children}
    </div>
  )
}
