import type { Milestone } from '../../../src/types/index'

export function buildDeveloperSystemPrompt(): string {
  return (
    'You are an expert software developer. ' +
    'You implement features precisely as specified in the milestone definition. ' +
    'Use TodoWrite to plan your work before implementing. ' +
    'Commit your changes with conventional commit messages. ' +
    'When done, output a concise implementation report listing what was done and the commit hash(es).'
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
    'Use TodoWrite to create one todo per acceptance criterion you are checking. ' +
    'Mark each todo as: completed = criterion fully met, ' +
    'in_progress = criterion checked but NOT met, ' +
    'pending = not yet checked.'
  )
}

export interface DeveloperContextInput {
  projectPath: string
  branch: string
  milestoneId: string
  milestoneTitle: string
  milestoneDescription: string
  iterationCount: number
  commitLog: string
  hasUncommitted: boolean
  remainingFeedback: string
}

export function buildDeveloperFirstMessage(input: DeveloperContextInput): string {
  const sections: string[] = [
    `## Your Context`,
    `- Current branch: ${input.branch}`,
    `- Iteration: ${input.iterationCount}`,
    ``,
    `## Project Files to Read First`,
    `- ${input.projectPath}/.anima/soul.md`,
    `- ${input.projectPath}/.anima/milestones/${input.milestoneId}.md`,
    ``,
    `## Milestone: ${input.milestoneTitle}`,
    input.milestoneDescription,
    ``,
    `## Previous Work (git log)`,
    input.commitLog || '(no commits yet)',
  ]

  if (input.hasUncommitted) {
    sections.push(``, `## Note`, `There are uncommitted changes from the previous iteration. Review and handle them.`)
  }

  if (input.remainingFeedback) {
    sections.push(``, `## Acceptor Feedback from Previous Round`, input.remainingFeedback)
  }

  sections.push(
    ``,
    `## Your Task`,
    `1. Read the milestone file and analyze what remains to be done`,
    `2. Use TodoWrite to create your implementation plan for this iteration`,
    `3. Implement the planned features`,
    `4. Commit with conventional commit format to branch ${input.branch}`,
    `5. Send an implementation report: what was done + commit hash(es)`
  )

  return sections.join('\n')
}

export function buildAcceptorMessage(
  milestone: Milestone,
  developerReport: string,
  iterationCount: number,
  projectPath: string
): string {
  const sections: string[] = [
    `## Your Context`,
    `- Milestone: ${milestone.title}`,
    `- Iteration: ${iterationCount}`,
    ``,
    `## Files to Review`,
    `- ${projectPath}/.anima/soul.md (coding standards)`,
    `- ${projectPath}/.anima/milestones/${milestone.id}.md (acceptance criteria)`,
    ``,
    `## Developer's Implementation Report`,
    developerReport,
    ``,
    `## Your Task`,
    `1. Use TodoWrite to create one todo per acceptance criterion`,
    `2. Use git show / git diff to verify actual code changes`,
    `3. Perform functional testing: if MCP tools are available (e.g. Playwright MCP for web projects), use them to simulate real user interactions — navigate, click, fill forms, and verify runtime behavior`,
    `4. Update each todo: completed = passed, in_progress = checked but NOT met, pending = not yet checked`,
    `5. For any failing criteria, describe the specific issues in your response`,
  ]
  return sections.join('\n')
}

export function buildDeveloperFixMessage(acceptorFeedback: string): string {
  return (
    `## Acceptor Feedback\n\n${acceptorFeedback}\n\n` +
    `## Your Task\n` +
    `Fix the issues listed above. ` +
    `Commit your changes and send a new implementation report.`
  )
}

export function buildAcceptorFollowUpMessage(developerReport: string, round: number): string {
  const sections: string[] = [
    `## Developer Fix Report (Round ${round})`,
    developerReport,
    ``,
    `## Your Task`,
    `1. Update your TodoWrite checklist based on the developer's new changes`,
    `2. Verify the fixes address the issues you previously raised`,
    `3. For any remaining failures, describe the specific issues in your response`,
  ]
  return sections.join('\n')
}
