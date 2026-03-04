import dayjs from 'dayjs'
import { msUntil } from '../lib/time'
import type { SoulContext, Decision } from './types'

/**
 * Pure decision function — no side effects.
 * Given the current soul context, decide what to do next.
 */
export function think(context: SoulContext): Decision {
  const { project, milestones } = context
  if (!project) return { task: 'idle' }

  // Rate limited — idle until reset
  if (project.rateLimitResetAt && msUntil(project.rateLimitResetAt) > 0) {
    return { task: 'idle' }
  }

  // Find active milestone (in-progress takes priority)
  const active = milestones.find((m) => m.status === 'in-progress')
  if (active) return { task: 'execute-milestone', milestone: active }

  // Find ready milestone
  const ready = milestones.find((m) => m.status === 'ready')
  if (ready) return { task: 'execute-milestone', milestone: ready }

  // Check if we have pending planning/review milestones — don't trigger another plan
  const hasPendingPlanning = milestones.some(
    (m) => m.status === 'draft' || m.status === 'reviewing' || m.status === 'reviewed'
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
