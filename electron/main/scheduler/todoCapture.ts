import type { Milestone } from '../../../src/types/index'

/** Convert in_progress AC items to rejected after acceptor finishes */
export function finalizeAcceptorCriteria(
  milestone: Milestone,
  iteration: number
): Milestone | null {
  const hasInProgress = milestone.acceptanceCriteria.some(
    (ac) => ac.iteration === iteration && ac.status === 'in_progress'
  )
  if (!hasInProgress) return null
  const updated = milestone.acceptanceCriteria.map((ac) =>
    ac.iteration === iteration && ac.status === 'in_progress'
      ? { ...ac, status: 'rejected' as const }
      : ac
  )
  return { ...milestone, acceptanceCriteria: updated }
}
