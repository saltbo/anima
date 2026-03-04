import type { ReactNode } from 'react'

interface TimelineEventProps {
  icon: ReactNode
  iconBg?: string
  showLine?: boolean
  children: ReactNode
  className?: string
}

/**
 * A single timeline event with a dot/icon column and a content column.
 * The vertical line connects events visually.
 */
export function TimelineEvent({
  icon,
  iconBg = 'bg-muted',
  showLine = true,
  children,
  className = '',
}: TimelineEventProps) {
  return (
    <div className={`flex gap-3 ${className}`}>
      {/* Dot column */}
      <div className="flex flex-col items-center shrink-0 w-8">
        <div className={`flex items-center justify-center w-7 h-7 rounded-full ${iconBg} shrink-0`}>
          {icon}
        </div>
        {showLine && (
          <div className="w-0.5 flex-1 bg-border" />
        )}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        {children}
      </div>
    </div>
  )
}

/* ── Shared sub-components ─────────────────────────────────────────────── */

interface TimelineEventHeaderProps {
  author: string
  action: string
  time: string
}

export function TimelineEventHeader({ author, action, time }: TimelineEventHeaderProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-foreground">{author}</span>
      <span className="text-xs text-muted-foreground">{action}</span>
      <span className="text-xs text-muted-foreground">{time}</span>
    </div>
  )
}
