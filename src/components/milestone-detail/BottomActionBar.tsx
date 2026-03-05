import { MergeDecisionCard } from './MergeDecisionCard'
import { ApproveCard } from './ApproveCard'
import { CancelCard } from './CancelCard'
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
  onRequestChanges: () => void
  onRollback: () => void
  onCloseWithComment?: () => void
  onApprove?: () => void
  onCancel?: () => void
}

// Statuses where close is not available (terminal + in_progress which must cancel first)
const NO_CLOSE_STATUSES: MilestoneStatus[] = ['completed', 'cancelled', 'closed', 'in_progress']

// Statuses that support cancel
const CANCELLABLE_STATUSES: MilestoneStatus[] = ['ready', 'in_progress']

export function BottomActionBar({
  status,
  completedTaskCount, totalTaskCount,
  passedACCount, totalACCount, iterationCount,
  commentText, onCommentChange, onCommentSubmit,
  onAcceptMerge, onRequestChanges, onRollback, onCloseWithComment,
  onApprove, onCancel,
}: BottomActionBarProps) {
  const isInReview = status === 'in_review'
  const isPlanned = status === 'planned'
  const canClose = !NO_CLOSE_STATUSES.includes(status)
  const canCancel = CANCELLABLE_STATUSES.includes(status)

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
          onRequestChanges={onRequestChanges}
          onRollback={onRollback}
        />
      )}
      {canCancel && onCancel && (
        <CancelCard onCancel={onCancel} />
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
