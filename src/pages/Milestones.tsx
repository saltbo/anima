import { useParams, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'

export function Milestones() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-app-text-primary">Milestones</h2>
        <button
          onClick={() => navigate(`/projects/${id}/milestones/new`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-app-accent/10 hover:bg-app-accent/20 text-app-accent text-xs font-medium transition-colors"
        >
          <Plus size={12} />
          New Milestone
        </button>
      </div>

      {/* Groups: ready, draft, completed */}
      <MilestoneGroup label="Ready" count={0} />
      <MilestoneGroup label="Draft" count={0} />
      <MilestoneGroup label="Completed" count={0} />

      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="text-3xl">🏁</div>
        <p className="text-sm text-app-text-secondary">
          No milestones yet.{' '}
          <button
            onClick={() => navigate(`/projects/${id}/milestones/new`)}
            className="text-app-accent hover:underline"
          >
            Create one
          </button>{' '}
          to get started.
        </p>
      </div>
    </div>
  )
}

function MilestoneGroup({ label, count }: { label: string; count: number }) {
  if (count === 0) return null
  return (
    <div>
      <h3 className="text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
        {label}
      </h3>
      <div className="space-y-2">{/* milestone items */}</div>
    </div>
  )
}
