import { Badge } from '@/components/ui/badge'
import { cn, statusColor, statusIcon, statusLabel } from '@/lib/utils'
import type { ProjectStatus } from '@/types'

interface StatusBadgeProps {
  status: ProjectStatus
  showLabel?: boolean
  className?: string
}

export function StatusBadge({ status, showLabel = true, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 border-0 px-0 font-medium', statusColor(status), className)}
    >
      <span>{statusIcon(status)}</span>
      {showLabel && <span>{statusLabel(status)}</span>}
    </Badge>
  )
}
