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

  return { task: 'idle' }
}
