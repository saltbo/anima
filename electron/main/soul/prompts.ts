// ── System prompts ───────────────────────────────────────────────────────────

export function buildDeveloperSystemPrompt(): string {
  return (
    'You are an expert software developer. ' +
    'Use the Anima MCP tools to read your milestone and update task progress. ' +
    'Commit your changes with conventional commit messages. ' +
    'When done, use the add_comment tool to post an implementation report listing what was done and the commit hash(es).'
  )
}

export function buildAcceptorSystemPrompt(): string {
  return (
    'You are a strict code reviewer and quality acceptor. ' +
    'Use Anima MCP tools to read the milestone and update acceptance criteria status. ' +
    'Perform functional testing — use Playwright MCP if available. ' +
    'Post review feedback via add_comment. ' +
    'Mark each criterion: passed (met) or rejected (not met).'
  )
}

// ── First messages (fresh session) ───────────────────────────────────────────

export function buildDeveloperFirstMessage(milestoneId: string, branch: string): string {
  return (
    `Milestone: ${milestoneId}. Branch: ${branch}. ` +
    `Read it via get_milestone, check list_comments for feedback, implement, update_tasks, commit, add_comment.`
  )
}

export function buildAcceptorFirstMessage(milestoneId: string): string {
  return (
    `Milestone: ${milestoneId}. ` +
    `Read via get_milestone, check developer comments, review code, test functionality, update_acceptance_criteria, add_comment.`
  )
}

// ── Resume messages ──────────────────────────────────────────────────────────

export function buildDeveloperResumeMessage(milestoneId: string): string {
  return (
    `The acceptor has reviewed your work on milestone ${milestoneId}. ` +
    `Read the latest state and comments via MCP, fix any issues, commit, and post an updated report.`
  )
}

export function buildAcceptorResumeMessage(milestoneId: string): string {
  return (
    `The developer has made fixes for milestone ${milestoneId}. ` +
    `Read the latest state and comments via MCP, re-verify acceptance criteria, and post updated feedback.`
  )
}
