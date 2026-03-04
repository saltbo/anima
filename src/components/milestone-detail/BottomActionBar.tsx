import { MergeDecisionCard } from './MergeDecisionCard'
import { ApproveCard } from './ApproveCard'
import { CommentInput } from './CommentInput'
import type { MilestoneStatus } from '@/types/index'

interface BottomActionBarProps {
  status: MilestoneStatus
  completedTaskCount: number
  totalTaskCount: number
  passedACCount: number
  totalACCount: number
  iterationCount: number
  commentText: string
  onCommentChange: (value: string) => void
  onCommentSubmit: () => void
  onAcceptMerge: () => void
  onRollback: () => void
  onCloseWithComment?: () => void
  onApprove?: () => void
}

// Terminal statuses where close is not available
const TERMINAL_STATUSES: MilestoneStatus[] = ['completed', 'cancelled', 'closed']

export function BottomActionBar({
  status,
  completedTaskCount, totalTaskCount,
  passedACCount, totalACCount, iterationCount,
  commentText, onCommentChange, onCommentSubmit,
  onAcceptMerge, onRollback, onCloseWithComment,
  onApprove,
}: BottomActionBarProps) {
  const isInReview = status === 'in_review'
  const isPlanned = status === 'planned'
  const canClose = !TERMINAL_STATUSES.includes(status)

  return (
    <div className="pr-6 pt-4 pb-5 border-t border-border bg-card space-y-3.5 shrink-0">
      {isPlanned && onApprove && (
        <ApproveCard onApprove={onApprove} />
      )}
      {isInReview && (
        <MergeDecisionCard
          completedTaskCount={completedTaskCount}
          totalTaskCount={totalTaskCount}
          passedACCount={passedACCount}
          totalACCount={totalACCount}
          iterationCount={iterationCount}
          onAcceptMerge={onAcceptMerge}
          onRollback={onRollback}
        />
      )}
      <CommentInput
        value={commentText}
        onChange={onCommentChange}
        onSubmit={onCommentSubmit}
        canClose={canClose}
        onClose={onCloseWithComment}
      />
    </div>
  )
}
