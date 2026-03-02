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
    'Use TodoWrite to create one todo per acceptance criterion you are checking. ' +
    'Mark todos as completed only when the criterion is fully met. ' +
    'At the end of your review, explicitly state: ' +
    '"MILESTONE_COMPLETE" if all requirements are satisfied, or ' +
    '"MILESTONE_INCOMPLETE: <unmet items>" if requirements remain.'
  )
}

export interface DeveloperContextInput {
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
    `- ./VISION.md`,
    `- ./.anima/soul.md`,
    `- ./.anima/milestones/${input.milestoneId}.md`,
    `- ./.anima/memory/project.md (if exists)`,
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
  iterationCount: number
): string {
  const sections: string[] = [
    `## Your Context`,
    `- Milestone: ${milestone.title}`,
    `- Iteration: ${iterationCount}`,
    ``,
    `## Files to Review`,
    `- ./.anima/soul.md (coding standards)`,
    `- ./.anima/milestones/${milestone.id}.md (acceptance criteria)`,
    ``,
    `## Developer's Implementation Report`,
    developerReport,
    ``,
    `## Your Task`,
    `1. Use TodoWrite to create one todo per acceptance criterion`,
    `2. Use git show / git diff to verify actual code changes`,
    `3. Update each todo: completed = passed, pending = not yet met`,
    `4. List specific issues for any failing criteria`,
    `5. End your response with either:`,
    `   - "MILESTONE_COMPLETE" (all criteria met, no more work needed)`,
    `   - "MILESTONE_INCOMPLETE: <list unmet items>" (more work needed)`,
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
    `3. End your response with either:`,
    `   - "MILESTONE_COMPLETE" (all criteria met)`,
    `   - "MILESTONE_INCOMPLETE: <list unmet items>" (more work needed)`,
  ]
  return sections.join('\n')
}
