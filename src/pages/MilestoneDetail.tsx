import { useParams } from 'react-router-dom'

export function MilestoneDetail() {
  const { id, mid } = useParams<{ id: string; mid: string }>()

  return (
    <div className="p-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Milestone Detail</h2>
        <p className="text-sm text-muted-foreground">
          Milestone <code className="text-foreground">{mid}</code> in project{' '}
          <code className="text-foreground">{id}</code>.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Milestone content editor will be available in M3.
        </p>
      </div>
    </div>
  )
}
