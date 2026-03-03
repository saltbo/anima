export function buildDeveloperSystemPrompt(): string {
  return (
    'You are an expert software developer. ' +
    'You implement features precisely as specified in the milestone definition. ' +
    'Use the Anima MCP tools to read your milestone and update task progress. ' +
    'Commit your changes with conventional commit messages. ' +
    'When done, use the add_comment tool to post an implementation report listing what was done and the commit hash(es).'
  )
}

export function buildAcceptorSystemPrompt(): string {
  return (
    'You are a strict code reviewer and quality acceptor. ' +
    'You verify that implementations meet the stated acceptance criteria. ' +
    'Your verification is NOT limited to reading code — you must also perform functional testing. ' +
    'If the project has MCP tools available (e.g. Playwright MCP for web apps), ' +
    'use them to simulate real user interactions: navigate pages, click buttons, fill forms, ' +
    'and verify the actual runtime behavior matches acceptance criteria. ' +
    'Use the Anima MCP tools to read the milestone and update acceptance criteria status. ' +
    'Mark each criterion as: passed = criterion fully met, ' +
    'in_progress = criterion checked but NOT met, ' +
    'pending = not yet checked. ' +
    'Use add_comment to post your review feedback.'
  )
}

export interface DeveloperMessageInput {
  milestoneId: string
  branch: string
  iterationCount: number
}

export function buildDeveloperFirstMessage(input: DeveloperMessageInput): string {
  return [
    `## Your Context`,
    `- Milestone ID: ${input.milestoneId}`,
    `- Current branch: ${input.branch}`,
    `- Iteration: ${input.iterationCount}`,
    ``,
    `## Your Task`,
    `1. Use \`get_milestone("${input.milestoneId}")\` to read the milestone details and acceptance criteria`,
    `2. Use \`list_comments("${input.milestoneId}")\` to read any previous feedback from the acceptor`,
    `3. Analyze what remains to be done based on the milestone and feedback`,
    `4. Use \`update_tasks\` to plan and track your implementation tasks`,
    `5. Implement the planned features`,
    `6. Commit with conventional commit format to branch \`${input.branch}\``,
    `7. Use \`add_comment\` to post an implementation report: what was done + commit hash(es)`,
  ].join('\n')
}

export interface AcceptorMessageInput {
  milestoneId: string
  iterationCount: number
}

export function buildAcceptorFirstMessage(input: AcceptorMessageInput): string {
  return [
    `## Your Context`,
    `- Milestone ID: ${input.milestoneId}`,
    `- Iteration: ${input.iterationCount}`,
    ``,
    `## Your Task`,
    `1. Use \`get_milestone("${input.milestoneId}")\` to read the milestone details and acceptance criteria`,
    `2. Use \`list_comments("${input.milestoneId}")\` to read the developer's implementation report`,
    `3. Use git show / git diff to verify actual code changes`,
    `4. Perform functional testing: if MCP tools are available (e.g. Playwright MCP), use them to simulate real user interactions`,
    `5. Use \`update_acceptance_criteria\` to set each criterion's status: passed, in_progress (not met), or pending (not checked)`,
    `6. Use \`add_comment\` to post your review feedback describing any issues found`,
  ].join('\n')
}

export function buildContinueMessage(role: 'developer' | 'acceptor', milestoneId: string): string {
  if (role === 'developer') {
    return [
      `The acceptor has posted new feedback. Please:`,
      `1. Use \`list_comments("${milestoneId}")\` to read the latest feedback`,
      `2. Fix the issues raised`,
      `3. Commit your changes`,
      `4. Use \`add_comment\` to post an updated implementation report`,
    ].join('\n')
  }
  return [
    `The developer has posted fixes. Please:`,
    `1. Use \`list_comments("${milestoneId}")\` to read the developer's latest report`,
    `2. Re-verify the acceptance criteria against the new changes`,
    `3. Use \`update_acceptance_criteria\` to update the status of each criterion`,
    `4. Use \`add_comment\` to post your updated review feedback`,
  ].join('\n')
}
