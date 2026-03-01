import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'

export function MilestoneNew() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-app-border">
        <button
          onClick={() => navigate(`/projects/${id}/milestones`)}
          className="text-app-text-secondary hover:text-app-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-sm font-semibold text-app-text-primary">New Milestone</h2>
      </div>

      {/* Chat interface placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-app-surface border border-app-border flex items-center justify-center">
          <MessageSquare size={20} className="text-app-text-secondary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-app-text-primary">
            Conversational Milestone Creation
          </h3>
          <p className="text-sm text-app-text-secondary mt-1">
            Chat interface will be available in M3. You&apos;ll describe your milestone and Anima
            will help structure it.
          </p>
        </div>
      </div>
    </div>
  )
}
