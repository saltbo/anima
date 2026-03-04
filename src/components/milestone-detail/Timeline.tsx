import { MessageSquare, Check, CircleCheck } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import { useTheme } from '@/store/theme'
import { timeAgo, formatElapsed } from '@/lib/time'
import { TimelineEvent, TimelineEventHeader } from './TimelineEvent'
import { ReviewCommentCard } from './ReviewCommentCard'
import { IterationAgentCard } from './IterationAgentCard'
import type { Iteration, MilestoneComment, IterationOutcome } from '@/types/index'

interface TimelineProps {
  comments: MilestoneComment[]
  iterations: Iteration[]
  onViewSession?: (role: 'developer' | 'acceptor', iteration: Iteration) => void
}

function outcomeBadgeClass(outcome?: IterationOutcome): string {
  switch (outcome) {
    case 'passed': return 'bg-green-100 text-green-600'
    case 'rejected': return 'bg-orange-100 text-orange-600'
    case 'error': return 'bg-red-100 text-red-600'
    case 'rate_limited': return 'bg-red-100 text-red-600'
    case 'cancelled': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted text-muted-foreground'
  }
}

function outcomeLabel(outcome?: IterationOutcome): string {
  switch (outcome) {
    case 'passed': return 'Passed'
    case 'rejected': return 'Rejected'
    case 'cancelled': return 'Cancelled'
    case 'rate_limited': return 'Rate Limited'
    case 'error': return 'Error'
    default: return 'In Progress'
  }
}

export function Timeline({ comments, iterations, onViewSession }: TimelineProps) {
  const { resolvedTheme } = useTheme()
  // Build timeline events in chronological order
  type TimelineEntry =
    | { type: 'comment'; comment: MilestoneComment; time: string }
    | { type: 'iteration'; iteration: Iteration; time: string }

  const entries: TimelineEntry[] = []

  // Add system comments (reviews)
  comments.forEach((c) => {
    entries.push({ type: 'comment', comment: c, time: c.createdAt })
  })

  // Add iterations
  iterations.forEach((iter) => {
    if (iter.startedAt) {
      entries.push({ type: 'iteration', iteration: iter, time: iter.startedAt })
    }
  })

  // Sort chronologically
  entries.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  if (entries.length === 0) {
    return (
      <div className="py-12 flex items-center justify-center px-8">
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    )
  }

  // Compute display numbers for iterations (1-based index among iteration entries only)
  const iterDisplayNum = new Map<Iteration, number>()
  let iterCounter = 0
  for (const e of entries) {
    if (e.type === 'iteration') {
      iterCounter++
      iterDisplayNum.set(e.iteration, iterCounter)
    }
  }

  // Check if there's a trailing "Acceptor review passed" event after the loop
  const hasTrailingAcceptorEvent =
    iterations.length > 0 && iterations[iterations.length - 1]?.outcome === 'passed'

  return (
    <div className="px-8 py-5">
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1
        // Show line if not last, OR if last but there's a trailing acceptor event
        const showLine = !isLast || hasTrailingAcceptorEvent

        if (entry.type === 'comment') {
          const c = entry.comment
          const isSystem = c.author === 'system'
          return (
            <TimelineEvent
              key={`e-${idx}`}
              icon={<MessageSquare size={14} className="text-muted-foreground" />}
              iconBg="bg-muted"
              showLine={showLine}
              className="pt-5 pb-1"
            >
              <TimelineEventHeader
                author={isSystem ? 'Reviewer' : 'You'}
                action={isSystem ? 'posted a milestone review' : 'posted a comment'}
                time={timeAgo(c.createdAt)}
              />
              {isSystem ? (
                <ReviewCommentCard comment={c} />
              ) : (
                <div className="mt-2 rounded-lg border border-border bg-background/50 px-3.5 py-3" data-color-mode={resolvedTheme}>
                  <MDEditor.Markdown source={c.body} className="!bg-transparent !text-[13px]" />
                </div>
              )}
            </TimelineEvent>
          )
        }

        if (entry.type === 'iteration') {
          const iter = entry.iteration
          const displayNum = iterDisplayNum.get(iter) ?? iter.round
          return (
            <TimelineEvent
              key={`e-${idx}`}
              icon={<Check size={14} className="text-green-600" />}
              iconBg="bg-green-100"
              showLine={showLine}
              className="pt-3 pb-1"
            >
              {/* Iteration header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">
                  Iteration #{displayNum}
                </span>
                {iter.outcome && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${outcomeBadgeClass(iter.outcome)}`}>
                    {outcomeLabel(iter.outcome)}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {formatElapsed(iter.startedAt, iter.completedAt)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {iter.startedAt ? timeAgo(iter.startedAt) : ''}
                </span>
              </div>

              {/* Agent cards */}
              <div className="flex gap-2.5 mt-2.5">
                <div className="flex-1">
                  <IterationAgentCard
                    role="developer"
                    iteration={iter}
                    onViewSession={onViewSession ? () => onViewSession('developer', iter) : undefined}
                  />
                </div>
                <div className="flex-1">
                  <IterationAgentCard
                    role="acceptor"
                    iteration={iter}
                    onViewSession={onViewSession ? () => onViewSession('acceptor', iter) : undefined}
                  />
                </div>
              </div>
            </TimelineEvent>
          )
        }

        return null
      })}

      {/* Final acceptor review event (if last iteration passed) */}
      {iterations.length > 0 && iterations[iterations.length - 1]?.outcome === 'passed' && (
        <TimelineEvent
          icon={<CircleCheck size={14} className="text-green-600" />}
          iconBg="bg-green-100"
          showLine={false}
          className="pt-3 pb-1"
        >
          <TimelineEventHeader
            author="Acceptor"
            action="review passed — milestone awaiting human review"
            time={iterations[iterations.length - 1]?.completedAt ? timeAgo(iterations[iterations.length - 1].completedAt!) : ''}
          />
        </TimelineEvent>
      )}
    </div>
  )
}
