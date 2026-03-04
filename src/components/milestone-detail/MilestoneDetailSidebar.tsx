import {
  GitBranch, CircleCheck, Circle, CircleX,
} from 'lucide-react'
import { formatTokens } from '@/lib/time'
import type {
  Milestone, MilestoneGitInfo, Iteration, IterationOutcome,
} from '@/types/index'
import { milestoneStatusLabel, milestoneStatusDotClass } from '@/lib/utils'

/* ── Section wrapper ──────────────────────────────────────────────────── */

function SidebarSection({
  children,
  noBorder = false,
}: {
  children: React.ReactNode
  noBorder?: boolean
}) {
  return (
    <div className={`p-5 ${noBorder ? '' : 'border-b border-border'}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground mb-3">
      {children}
    </p>
  )
}

/* ── Status Section ───────────────────────────────────────────────────── */

function StatusSection({ milestone }: { milestone: Milestone }) {
  return (
    <SidebarSection>
      <SectionLabel>Status</SectionLabel>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${milestoneStatusDotClass(milestone.status)}`} />
        <span className="text-[13px] font-medium text-foreground">
          {milestoneStatusLabel(milestone.status)}
        </span>
      </div>
    </SidebarSection>
  )
}

/* ── Git Section ──────────────────────────────────────────────────────── */

function GitSection({ gitInfo }: { gitInfo: MilestoneGitInfo }) {
  return (
    <SidebarSection>
      <SectionLabel>Git</SectionLabel>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-medium font-mono text-foreground truncate">
            {gitInfo.branch}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{gitInfo.commitCount} commit{gitInfo.commitCount !== 1 ? 's' : ''}</span>
          <span>&middot;</span>
          <span>{gitInfo.diffStats.filesChanged} files</span>
        </div>
        <div className="flex items-center gap-2.5 text-xs">
          <span className="font-semibold text-green-600">+{gitInfo.diffStats.insertions}</span>
          <span className="font-semibold text-red-600">-{gitInfo.diffStats.deletions}</span>
        </div>
      </div>
    </SidebarSection>
  )
}

/* ── Tasks Section ────────────────────────────────────────────────────── */

function TasksSection({ milestone }: { milestone: Milestone }) {
  const completedCount = milestone.tasks.filter((t) => t.completed).length
  const totalCount = milestone.tasks.length
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const allDone = completedCount === totalCount && totalCount > 0

  if (totalCount === 0) return null

  const sortedTasks = [...milestone.tasks].sort((a, b) => {
    if (a.completed === b.completed) return a.order - b.order
    return a.completed ? 1 : -1
  })

  return (
    <SidebarSection>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Tasks</SectionLabel>
        <span className={`text-xs font-semibold ${allDone ? 'text-green-600' : 'text-muted-foreground'}`}>
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Task list */}
      <div className="space-y-0.5">
        {sortedTasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 py-1">
            {task.completed
              ? <CircleCheck size={14} className="text-green-600 shrink-0" />
              : <Circle size={14} className="text-muted-foreground shrink-0" />
            }
            <span className={`text-xs leading-snug ${task.completed ? 'text-muted-foreground' : 'text-foreground'}`}>
              {task.title}
            </span>
          </div>
        ))}
      </div>
    </SidebarSection>
  )
}

/* ── Acceptance Criteria Section ──────────────────────────────────────── */

function ACSection({ milestone }: { milestone: Milestone }) {
  if (milestone.acceptanceCriteria.length === 0) return null

  return (
    <SidebarSection>
      <SectionLabel>Acceptance Criteria</SectionLabel>
      <div className="space-y-0.5">
        {milestone.acceptanceCriteria.map((ac, i) => (
          <div key={i} className="flex items-start gap-2 py-1">
            {ac.status === 'passed' && <CircleCheck size={14} className="text-green-600 mt-0.5 shrink-0" />}
            {ac.status === 'rejected' && <CircleX size={14} className="text-red-500 mt-0.5 shrink-0" />}
            {ac.status === 'in_progress' && <Circle size={14} className="text-yellow-500 mt-0.5 shrink-0 animate-pulse" />}
            {ac.status === 'pending' && <Circle size={14} className="text-muted-foreground mt-0.5 shrink-0" />}
            <span className={`text-xs leading-relaxed ${ac.status === 'pending' ? 'text-foreground' : 'text-muted-foreground'}`}>
              {ac.title}
            </span>
          </div>
        ))}
      </div>
    </SidebarSection>
  )
}

/* ── Iterations Section ───────────────────────────────────────────────── */

function outcomeIcon(outcome?: IterationOutcome) {
  switch (outcome) {
    case 'passed':
      return <CircleCheck size={12} className="text-green-600 shrink-0" />
    case 'error':
    case 'rejected':
      return <CircleX size={12} className="text-red-600 shrink-0" />
    default:
      return <Circle size={12} className="text-muted-foreground shrink-0" />
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

function IterationsSection({ iterations }: { iterations: Iteration[] }) {
  if (iterations.length === 0) return null

  return (
    <SidebarSection>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Iterations</SectionLabel>
        <span className="text-[11px] text-muted-foreground">
          {iterations.length} round{iterations.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-1.5">
        {iterations.map((iter, idx) => (
          <div
            key={`${iter.round}-${idx}`}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50"
          >
            {outcomeIcon(iter.outcome)}
            <span className="text-xs font-medium text-foreground">
              Round {idx + 1}
            </span>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {outcomeLabel(iter.outcome)}
            </span>
          </div>
        ))}
      </div>
    </SidebarSection>
  )
}

/* ── Usage / Cost Section ─────────────────────────────────────────────── */

function UsageSection({ milestone }: { milestone: Milestone }) {
  return (
    <SidebarSection noBorder>
      <SectionLabel>Usage</SectionLabel>
      <div className="flex items-center gap-5">
        <div className="space-y-0.5">
          <p className="text-base font-semibold text-foreground">
            {formatTokens(milestone.totalTokens)}
          </p>
          <p className="text-[11px] text-muted-foreground">tokens</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-base font-semibold text-foreground">
            ${milestone.totalCost.toFixed(2)}
          </p>
          <p className="text-[11px] text-muted-foreground">total cost</p>
        </div>
      </div>
    </SidebarSection>
  )
}

/* ── Main Sidebar ─────────────────────────────────────────────────────── */

interface MilestoneDetailSidebarProps {
  milestone: Milestone
  gitInfo: MilestoneGitInfo | null
  iterations: Iteration[]
}

export function MilestoneDetailSidebar({ milestone, gitInfo, iterations }: MilestoneDetailSidebarProps) {
  const showGit = gitInfo && (milestone.status === 'in-progress' || milestone.status === 'awaiting_review')

  return (
    <div className="w-80 shrink-0 border-l border-border">
      <StatusSection milestone={milestone} />
      {showGit && <GitSection gitInfo={gitInfo} />}
      <TasksSection milestone={milestone} />
      <ACSection milestone={milestone} />
      <IterationsSection iterations={iterations} />
      <UsageSection milestone={milestone} />
    </div>
  )
}
