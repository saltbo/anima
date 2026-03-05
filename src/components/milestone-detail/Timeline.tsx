import { MessageSquare, ArrowRight, Code, ShieldCheck, Sparkles } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import { useTheme } from '@/store/theme'
import { timeAgo } from '@/lib/time'
import { formatTokens } from '@/lib/time'
import { TimelineEvent, TimelineEventHeader } from './TimelineEvent'
import type { MilestoneComment, Action, AgentSession, StatusChangedDetail, AgentStartedDetail } from '@/types/index'

// ── Agent display names ─────────────────────────────────────────────────────

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  human: 'You',
  planner: 'Planner',
  developer: 'Developer',
  reviewer: 'Reviewer',
}

const AGENT_ICONS: Record<string, typeof Code> = {
  developer: Code,
  reviewer: ShieldCheck,
  planner: Sparkles,
}

const AGENT_ICON_COLORS: Record<string, string> = {
  developer: 'text-indigo-500',
  reviewer: 'text-green-600',
  planner: 'text-amber-500',
}

function getActorDisplay(actor: string): string {
  return AGENT_DISPLAY_NAMES[actor] ?? actor
}

// ── Status change labels ────────────────────────────────────────────────────

function statusChangeLabel(detail: StatusChangedDetail): string {
  if (detail.action === 'create') return 'created this milestone'
  if (detail.action === 'start_execution') return `started execution`
  return `${detail.action}: ${detail.from} → ${detail.to}`
}

// ── Props ───────────────────────────────────────────────────────────────────

interface TimelineProps {
  comments: MilestoneComment[]
  actions: Action[]
  sessions: AgentSession[]
  onViewSession?: (sessionId: string) => void
}

export function Timeline({ comments, actions, sessions, onViewSession }: TimelineProps) {
  const { resolvedTheme } = useTheme()

  // Build a session lookup by id
  const sessionMap = new Map(sessions.map((s) => [s.id, s]))

  // Build timeline entries in chronological order
  type TimelineEntry =
    | { type: 'comment'; comment: MilestoneComment; time: string }
    | { type: 'status_changed'; action: Action; detail: StatusChangedDetail; time: string }
    | { type: 'agent_started'; action: Action; detail: AgentStartedDetail; session?: AgentSession; time: string }

  const entries: TimelineEntry[] = []

  // Add comments
  comments.forEach((c) => {
    entries.push({ type: 'comment', comment: c, time: c.createdAt })
  })

  // Add actions
  actions.forEach((a) => {
    if (!a.detail) return
    const detail = JSON.parse(a.detail)
    if (a.type === 'status_changed') {
      entries.push({ type: 'status_changed', action: a, detail, time: a.createdAt })
    } else if (a.type === 'agent_started') {
      const session = detail.sessionId ? sessionMap.get(detail.sessionId) : undefined
      entries.push({ type: 'agent_started', action: a, detail, session, time: a.createdAt })
    }
  })

  // Sort chronologically
  entries.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  if (entries.length === 0) {
    return (
      <div className="py-12 flex items-center justify-center pr-6">
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    )
  }

  return (
    <div className="pr-6 py-5">
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1
        const showLine = !isLast

        if (entry.type === 'comment') {
          const c = entry.comment
          return (
            <TimelineEvent
              key={`e-${idx}`}
              icon={<MessageSquare size={14} className="text-muted-foreground" />}
              iconBg="bg-muted"
              showLine={showLine}
              className="pt-5 pb-1"
            >
              <TimelineEventHeader
                author={getActorDisplay(c.author)}
                action="posted a comment"
                time={timeAgo(c.createdAt)}
              />
              <div className="mt-2 rounded-lg border border-border bg-background/50 px-3.5 py-3" data-color-mode={resolvedTheme}>
                <MDEditor.Markdown source={c.body} className="!bg-transparent !text-[13px]" />
              </div>
            </TimelineEvent>
          )
        }

        if (entry.type === 'status_changed') {
          return (
            <TimelineEvent
              key={`e-${idx}`}
              icon={<ArrowRight size={14} className="text-muted-foreground" />}
              iconBg="bg-muted"
              showLine={showLine}
              className="pt-3 pb-1"
            >
              <TimelineEventHeader
                author={getActorDisplay(entry.action.actor)}
                action={statusChangeLabel(entry.detail)}
                time={timeAgo(entry.action.createdAt)}
              />
            </TimelineEvent>
          )
        }

        if (entry.type === 'agent_started') {
          const agentId = entry.action.actor
          const Icon = AGENT_ICONS[agentId] ?? Code
          const iconColor = AGENT_ICON_COLORS[agentId] ?? 'text-muted-foreground'
          const session = entry.session
          const label = getActorDisplay(agentId)

          return (
            <TimelineEvent
              key={`e-${idx}`}
              icon={<Icon size={14} className={iconColor} />}
              iconBg={agentId === 'developer' ? 'bg-indigo-100' : agentId === 'reviewer' ? 'bg-green-100' : 'bg-amber-100'}
              showLine={showLine}
              className="pt-3 pb-1"
            >
              <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon size={14} className={iconColor} />
                    <span className="text-xs font-semibold text-foreground">{label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      Round #{entry.detail.iterationRound}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {timeAgo(entry.action.createdAt)}
                    </span>
                  </div>
                  {session && onViewSession && (
                    <button
                      onClick={() => onViewSession(session.id)}
                      className="text-[11px] font-medium text-foreground hover:text-foreground/80 transition-colors cursor-pointer"
                    >
                      View Session &rarr;
                    </button>
                  )}
                </div>

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
            </TimelineEvent>
          )
        }

        return null
      })}
    </div>
  )
}
