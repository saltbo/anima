import { useParams } from 'react-router-dom'

export function MilestoneDetail() {
  const { id, mid } = useParams<{ id: string; mid: string }>()

  return (
    <div className="p-6">
      <div className="bg-app-surface border border-app-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-app-text-primary mb-4">Milestone Detail</h2>
        <p className="text-sm text-app-text-secondary">
          Milestone <code className="text-app-accent">{mid}</code> in project{' '}
          <code className="text-app-accent">{id}</code>.
        </p>
        <p className="text-sm text-app-text-secondary mt-2">
          Milestone content editor will be available in M3.
        </p>
      </div>
    </div>
  )
}
