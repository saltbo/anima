import { getAgent } from '../agents/registry'
import type { MilestoneComment } from '../../../src/types/index'

// ── Identity injection ──────────────────────────────────────────────────────

function withIdentity(agentId: string, basePrompt: string): string {
  return [
    `Your agent ID is "${agentId}". This is your unique identity in the system.`,
    'Use this ID wherever identification is required — for example, as the `author`',
    'parameter when calling milestones:addComment.',
    '',
    basePrompt,
  ].join('\n')
}

// ── System prompts ───────────────────────────────────────────────────────────

export function buildPlannerSystemPrompt(): string {
  const agent = getAgent('planner')!
  return withIdentity(agent.id, agent.systemPrompt)
}

export function buildDeveloperSystemPrompt(): string {
  const agent = getAgent('developer')!
  return withIdentity(agent.id, agent.systemPrompt)
}

export function buildAcceptorSystemPrompt(): string {
  const agent = getAgent('reviewer')!
  return withIdentity(agent.id, agent.systemPrompt)
}

// ── First messages (fresh session) ───────────────────────────────────────────

export function buildPlannerFirstMessage(projectId: string): string {
  return [
    `Plan the next milestone for project \`${projectId}\`.`,
    `Use backlog:list with project_id="${projectId}" to see what needs to be done.`,
    'Read .anima/soul.md for project context.',
    'For each selected backlog item, define 1-3 acceptance checks (observable, binary, product-level).',
    `Then use milestones:create with project_id="${projectId}" to create the milestone with backlog items and their checks.`,
  ].join(' ')
}

// ── Dispatch message (used by @mention dispatch) ────────────────────────────

export function buildDispatchMessage(
  agentId: string,
  milestoneId: string,
  branch: string,
  mentionComment?: MilestoneComment
): string {
  const parts: string[] = []

  if (agentId === 'developer') {
    parts.push(`Milestone: ${milestoneId}. Branch: ${branch}.`)
    parts.push('Read it via milestones:getById, then check milestones:listComments for context.')

    if (mentionComment) {
      parts.push(`\nYou were mentioned by @${mentionComment.author}:`)
      parts.push(`> ${mentionComment.body}`)
      parts.push('\nAddress the feedback above, then post your report via milestones:addComment ending with `@reviewer please review`.')
    } else {
      parts.push('Select at most 3 closely related features for this iteration (max 5 items including bug fixes).')
      parts.push('Implement with production quality, write unit tests (≥80% coverage) and integration tests (cover core flows), backlog:update to track progress, commit, milestones:addComment with full report ending with `@reviewer please review`.')
    }
  } else if (agentId === 'reviewer') {
    parts.push(`Milestone: ${milestoneId}.`)
    parts.push('Read via milestones:getById and milestones:listComments.')
    parts.push('Read the developer\'s latest comment to understand what was implemented in THIS iteration.')
    parts.push('ONLY review and update checks (via checks:update) for the items the developer worked on in this iteration.')
    parts.push('Do NOT fail the review because other checks are still pending — those are for future iterations.')

    if (mentionComment) {
      parts.push(`\nYou were mentioned by @${mentionComment.author}:`)
      parts.push(`> ${mentionComment.body}`)
      parts.push('\nReview the latest changes and post your feedback.')
    }

    parts.push('If all checks for this iteration pass, state approval clearly. If any fail, end your comment with `@developer fix ...`.')
  }

  return parts.join(' ')
}
