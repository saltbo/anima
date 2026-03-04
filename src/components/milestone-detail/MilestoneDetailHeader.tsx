import { Pencil } from 'lucide-react'
import { milestoneStatusLabel, milestoneStatusBadgeClass, milestoneStatusDotClass } from '@/lib/utils'
import { timeAgo } from '@/lib/time'
import type { Milestone } from '@/types/index'

interface MilestoneDetailHeaderProps {
  milestone: Milestone
  onEdit?: () => void
}

export function MilestoneDetailHeader({ milestone, onEdit }: MilestoneDetailHeaderProps) {
  const isReviewing = milestone.status === 'reviewing'

  return (
    <div className="flex flex-col gap-2.5 pr-6 pt-5 pb-4 border-b border-border shrink-0">
      {/* Top row: status badge + created time */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${milestoneStatusBadgeClass(milestone.status)}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${milestoneStatusDotClass(milestone.status)} ${isReviewing ? 'animate-pulse' : ''}`} />
          {milestoneStatusLabel(milestone.status)}
        </span>
        <span className="text-xs text-muted-foreground">Created {timeAgo(milestone.createdAt)}</span>
      </div>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground leading-snug">{milestone.title}</h2>
        {onEdit && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-foreground bg-background border border-border shadow-sm hover:bg-muted/50 transition-colors cursor-pointer shrink-0"
          >
            <Pencil size={13} />
            Edit
          </button>
        )}
      </div>
    </div>
  )
}
