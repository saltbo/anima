import dayjs from 'dayjs'
import { msUntil } from '../lib/time'
import type { SoulContext, Decision } from './types'

const MAX_DISPATCH_PER_ITERATION = 10

/**
 * Pure decision function — no side effects.
 * Given the current soul context, decide what to do next.
 */
export function think(context: SoulContext): Decision {
  const { project, milestones, pendingMentions } = context
  if (!project) return { task: 'idle' }

  // Rate limited — idle until reset
  if (project.rateLimitResetAt && msUntil(project.rateLimitResetAt) > 0) {
    return { task: 'idle' }
  }

  // Find active milestone (in-progress takes priority)
  const active = milestones.find((m) => m.status === 'in_progress')

  if (active) {
    // Check for @human mentions — pause (idle) to let user handle
    const humanMention = pendingMentions.find(
      (m) => m.agentId === 'human' && m.milestoneId === active.id
    )
    if (humanMention) return { task: 'idle' }

    // Check for @agent mentions
    const agentMention = pendingMentions.find(
      (m) => m.agentId !== 'human' && m.milestoneId === active.id
    )
    if (agentMention) {
      // Check dispatch count limit via current iteration
      const currentIter = active.iterations.find((i) => i.status === 'in_progress')
      if (currentIter && (currentIter.dispatchCount ?? 0) >= MAX_DISPATCH_PER_ITERATION) {
        // Over limit — treat as @human
        return { task: 'idle' }
      }
      return {
        task: 'dispatch-agent',
        agentId: agentMention.agentId,
        milestoneId: agentMention.milestoneId,
        commentId: agentMention.commentId,
      }
    }

    // Current iteration passed + still have failing checks → new iteration with developer
    const currentIter = active.iterations.find((i) => i.status === 'in_progress')
    if (currentIter?.status === 'in_progress') {
      // Iteration still in progress but no pending mentions — idle
      return { task: 'idle' }
    }

    // Check if iteration just passed but there are remaining failing checks
    const lastPassedIter = [...active.iterations]
      .reverse()
      .find((i) => i.status === 'passed')
    const allChecksPassed = active.checks.length > 0 && active.checks.every((c) => c.status === 'passed')

    if (lastPassedIter && !allChecksPassed) {
      return { task: 'dispatch-agent', agentId: 'developer', milestoneId: active.id }
    }

    // All checks passed — will be handled by MilestoneAgentTask's complete()
    if (allChecksPassed) return { task: 'idle' }

    // No mentions, no passed iteration, no work to do
    return { task: 'idle' }
  }

  // Find ready milestone → dispatch developer
  const ready = milestones.find((m) => m.status === 'ready')
  if (ready) {
    return { task: 'dispatch-agent', agentId: 'developer', milestoneId: ready.id }
  }

  // Check if we have pending planning/review milestones — don't trigger another plan
  const hasPendingPlanning = milestones.some(
    (m) => m.status === 'draft' || m.status === 'planning' || m.status === 'planned'
  )
  if (hasPendingPlanning) return { task: 'idle' }

  // Check if we should plan a new milestone
  if (shouldPlanMilestone(context)) return { task: 'plan-milestone' }

  return { task: 'idle' }
}

function shouldPlanMilestone(context: SoulContext): boolean {
  const { milestones, backlogItems } = context

  const todoItems = backlogItems.filter((i) => i.status === 'todo')
  if (todoItems.length === 0) return false

  // Condition 1: enough backlog accumulated (≥10)
  if (todoItems.length >= 10) return true

  // Condition 2: at least 1 todo + last milestone completed >30 days ago (or never completed)
  const lastCompleted = milestones
    .filter((m) => m.status === 'completed' && m.completedAt)
    .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1))[0]

  if (!lastCompleted) return true // never completed a milestone

  const daysSince = dayjs().diff(dayjs(lastCompleted.completedAt), 'day')
  return daysSince > 30
}
