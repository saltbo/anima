import { Code, ShieldCheck } from 'lucide-react'
import { formatTokens } from '@/lib/time'
import type { Iteration } from '@/types/index'

interface IterationAgentCardProps {
  role: 'developer' | 'acceptor'
  iteration: Iteration
  summary?: string
  onViewSession?: () => void
}

export function IterationAgentCard({ role, iteration, summary, onViewSession }: IterationAgentCardProps) {
  const isDeveloper = role === 'developer'
  const Icon = isDeveloper ? Code : ShieldCheck
  const label = isDeveloper ? 'Developer' : 'Acceptor'
  const iconColor = isDeveloper ? 'text-indigo-500' : 'text-green-600'
  const sessionId = isDeveloper ? iteration.developerSessionId : iteration.acceptorSessionId

  // Per-role cost split (rough 60/40 for dev/acc)
  const tokens = iteration.totalTokens
    ? Math.round(iteration.totalTokens * (isDeveloper ? 0.6 : 0.4))
    : undefined
  const cost = iteration.totalCost
    ? iteration.totalCost * (isDeveloper ? 0.6 : 0.4)
    : undefined

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={iconColor} />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        {sessionId && onViewSession && (
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
      {(tokens || cost !== undefined) && (
        <div className="flex items-center gap-3">
          {tokens !== undefined && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {formatTokens(tokens)} tokens
            </span>
          )}
          {cost !== undefined && (
            <span className="text-[10px] font-medium text-muted-foreground">
              ${cost.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
