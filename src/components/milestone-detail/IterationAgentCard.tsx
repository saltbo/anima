import { Code, ShieldCheck } from 'lucide-react'
import { formatTokens } from '@/lib/time'
import type { AgentSession } from '@/types/index'

interface IterationAgentCardProps {
  role: 'developer' | 'reviewer'
  session?: AgentSession
  summary?: string
  onViewSession?: () => void
}

export function IterationAgentCard({ role, session, summary, onViewSession }: IterationAgentCardProps) {
  const isDeveloper = role === 'developer'
  const Icon = isDeveloper ? Code : ShieldCheck
  const label = isDeveloper ? 'Developer' : 'Reviewer'
  const iconColor = isDeveloper ? 'text-indigo-500' : 'text-green-600'

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={iconColor} />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        {session && onViewSession && (
          <button
            onClick={onViewSession}
            className="text-[11px] font-medium text-foreground hover:text-foreground/80 transition-colors cursor-pointer"
          >
            View Session &rarr;
          </button>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
      )}

      {/* Meta */}
      {session && (session.totalTokens > 0 || session.totalCost > 0) && (
        <div className="flex items-center gap-3">
          {session.totalTokens > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {formatTokens(session.totalTokens)} tokens
            </span>
          )}
          {session.totalCost > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground">
              ${session.totalCost.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
