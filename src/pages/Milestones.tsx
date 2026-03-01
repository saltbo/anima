import { useParams, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Milestones() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Milestones</h2>
        <Button size="sm" onClick={() => navigate(`/projects/${id}/milestones/new`)}>
          <Plus size={12} className="mr-1.5" />
          New Milestone
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="text-3xl">🏁</div>
        <p className="text-sm text-muted-foreground">
          No milestones yet.{' '}
          <button
            onClick={() => navigate(`/projects/${id}/milestones/new`)}
            className="text-foreground hover:underline"
          >
            Create one
          </button>{' '}
          to get started.
        </p>
      </div>
    </div>
  )
}
