import { ChevronDown } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import { useTheme } from '@/store/theme'
import type { MilestoneComment } from '@/types/index'

interface ReviewCommentCardProps {
  comment: MilestoneComment
}

export function ReviewCommentCard({ comment }: ReviewCommentCardProps) {
  const { resolvedTheme } = useTheme()

  // Determine verdict from comment body (simple heuristic)
  const isNeedsRevision = comment.body.toLowerCase().includes('not ready') ||
    comment.body.toLowerCase().includes('needs revision') ||
    comment.body.toLowerCase().includes('needs work')

  return (
    <div className="rounded-lg border border-border overflow-hidden mt-2">
      {/* Card header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isNeedsRevision ? 'bg-red-500' : 'bg-green-500'}`} />
          <span className="text-xs font-semibold text-foreground">
            Verdict: {isNeedsRevision ? 'Needs Revision' : 'Approved'}
          </span>
        </div>
        <ChevronDown size={14} className="text-muted-foreground" />
      </div>
      {/* Card body */}
      <div className="px-3.5 py-3 bg-background/50" data-color-mode={resolvedTheme}>
        <MDEditor.Markdown source={comment.body} className="!bg-transparent !text-[13px]" />
      </div>
    </div>
  )
}
