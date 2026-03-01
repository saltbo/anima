import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function MilestoneNew() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/projects/${id}/milestones`)}
          className="h-7 w-7"
        >
          <ArrowLeft size={14} />
        </Button>
        <h2 className="text-sm font-semibold text-foreground">New Milestone</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center">
          <MessageSquare size={20} className="text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Conversational Milestone Creation
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Chat interface will be available in M3. You&apos;ll describe your milestone and Anima
            will help structure it.
          </p>
        </div>
      </div>
    </div>
  )
}
