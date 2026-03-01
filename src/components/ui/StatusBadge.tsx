import { cn, statusColor, statusIcon, statusLabel } from '@/lib/utils'
import type { ProjectStatus } from '@/types'

interface StatusBadgeProps {
  status: ProjectStatus
  showLabel?: boolean
  className?: string
}

export function StatusBadge({ status, showLabel = true, className }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', statusColor(status), className)}>
      <span>{statusIcon(status)}</span>
      {showLabel && <span>{statusLabel(status)}</span>}
    </span>
  )
}
