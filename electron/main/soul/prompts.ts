import { getAgent } from '../agents/registry'

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

export function buildDeveloperFirstMessage(milestoneId: string, branch: string): string {
  return [
    `Milestone: ${milestoneId}. Branch: ${branch}.`,
    'Read it via milestones:getById, then select at most 3 closely related features for this iteration (max 5 items including bug fixes).',
    'Check milestones:listComments for any prior feedback.',
    'Implement with production quality, write unit tests (≥80% coverage) and integration tests (cover core flows), backlog:update to track progress, commit, milestones:addComment with full report.',
  ].join(' ')
}

export function buildAcceptorFirstMessage(milestoneId: string): string {
  return (
    `Milestone: ${milestoneId}. ` +
    `Read via milestones:getById, check developer comments, review code, test functionality, checks:update for each criterion, milestones:addComment.`
  )
}

// ── Resume messages ──────────────────────────────────────────────────────────

export function buildDeveloperResumeMessage(milestoneId: string): string {
  return [
    `The acceptor has reviewed your work on milestone ${milestoneId}.`,
    'Read the latest state and comments via MCP.',
    'Fix any issues raised by the acceptor, then continue with the current iteration scope.',
    'Do NOT expand scope to new features — only address review feedback and bug fixes.',
    'Ensure tests pass (unit ≥80% coverage, integration covers core flows), commit, and post an updated report.',
  ].join(' ')
}

export function buildAcceptorResumeMessage(milestoneId: string): string {
  return (
    `The developer has made fixes for milestone ${milestoneId}. ` +
    `Read the latest state and comments via MCP, re-verify acceptance criteria, and post updated feedback.`
  )
}
