import { describe, it, expect } from 'vitest'
import {
  buildDeveloperSystemPrompt,
  buildAcceptorSystemPrompt,
  buildDeveloperFirstMessage,
  buildAcceptorMessage,
  buildDeveloperFixMessage,
  buildAcceptorFollowUpMessage,
} from '../prompts'

describe('buildDeveloperSystemPrompt', () => {
  it('returns a non-empty string mentioning TodoWrite', () => {
    const prompt = buildDeveloperSystemPrompt()
    expect(prompt).toContain('TodoWrite')
    expect(prompt).toContain('developer')
  })
})

describe('buildAcceptorSystemPrompt', () => {
  it('returns a string mentioning TodoWrite status semantics', () => {
    const prompt = buildAcceptorSystemPrompt()
    expect(prompt).toContain('completed')
    expect(prompt).toContain('in_progress')
    expect(prompt).toContain('functional testing')
  })
})

describe('buildDeveloperFirstMessage', () => {
  it('includes branch, iteration count, and milestone info', () => {
    const msg = buildDeveloperFirstMessage({
      projectPath: '/test/project',
      branch: 'milestone/m-1',
      milestoneId: 'm-1',
      milestoneTitle: 'Add auth',
      milestoneDescription: 'Implement login/signup',
      iterationCount: 3,
      commitLog: 'abc1234 feat: add login form',
      hasUncommitted: false,
      remainingFeedback: '',
    })

    expect(msg).toContain('milestone/m-1')
    expect(msg).toContain('Iteration: 3')
    expect(msg).toContain('Add auth')
    expect(msg).toContain('Implement login/signup')
    expect(msg).toContain('abc1234 feat: add login form')
    expect(msg).toContain('.anima/milestones/m-1.md')
  })

  it('shows no commits placeholder when commitLog is empty', () => {
    const msg = buildDeveloperFirstMessage({
      projectPath: '/test/project',
      branch: 'milestone/m-2',
      milestoneId: 'm-2',
      milestoneTitle: 'Test',
      milestoneDescription: 'desc',
      iterationCount: 1,
      commitLog: '',
      hasUncommitted: false,
      remainingFeedback: '',
    })

    expect(msg).toContain('(no commits yet)')
  })

  it('includes uncommitted changes note when present', () => {
    const msg = buildDeveloperFirstMessage({
      projectPath: '/test/project',
      branch: 'milestone/m-3',
      milestoneId: 'm-3',
      milestoneTitle: 'Test',
      milestoneDescription: 'desc',
      iterationCount: 1,
      commitLog: '',
      hasUncommitted: true,
      remainingFeedback: '',
    })

    expect(msg).toContain('uncommitted changes')
  })

  it('includes acceptor feedback when provided', () => {
    const msg = buildDeveloperFirstMessage({
      projectPath: '/test/project',
      branch: 'milestone/m-4',
      milestoneId: 'm-4',
      milestoneTitle: 'Test',
      milestoneDescription: 'desc',
      iterationCount: 2,
      commitLog: '',
      hasUncommitted: false,
      remainingFeedback: 'Login button is missing validation',
    })

    expect(msg).toContain('Acceptor Feedback from Previous Round')
    expect(msg).toContain('Login button is missing validation')
  })

  it('does not include feedback section when empty', () => {
    const msg = buildDeveloperFirstMessage({
      projectPath: '/test/project',
      branch: 'milestone/m-5',
      milestoneId: 'm-5',
      milestoneTitle: 'Test',
      milestoneDescription: 'desc',
      iterationCount: 1,
      commitLog: '',
      hasUncommitted: false,
      remainingFeedback: '',
    })

    expect(msg).not.toContain('Acceptor Feedback')
  })
})

describe('buildAcceptorMessage', () => {
  const milestone = {
    id: 'm-1',
    title: 'Add auth',
    description: 'Implement login',
    status: 'in-progress' as const,
    acceptanceCriteria: [],
    tasks: [],

    createdAt: '2026-01-01',
    iterationCount: 1,
    iterations: [],
  }

  it('includes milestone title and developer report', () => {
    const msg = buildAcceptorMessage(milestone, 'I added login form. Commit: abc1234', 2, '/test/project')

    expect(msg).toContain('Add auth')
    expect(msg).toContain('Iteration: 2')
    expect(msg).toContain('I added login form. Commit: abc1234')
    expect(msg).toContain('.anima/milestones/m-1.md')
  })
})

describe('buildDeveloperFixMessage', () => {
  it('includes feedback and fix instructions', () => {
    const msg = buildDeveloperFixMessage('Missing error handling on form submit')

    expect(msg).toContain('Acceptor Feedback')
    expect(msg).toContain('Missing error handling on form submit')
    expect(msg).toContain('Fix the issues')
  })
})

describe('buildAcceptorFollowUpMessage', () => {
  it('includes developer report and round number', () => {
    const msg = buildAcceptorFollowUpMessage('Fixed validation. Commit: def5678', 2)

    expect(msg).toContain('Developer Fix Report (Round 2)')
    expect(msg).toContain('Fixed validation. Commit: def5678')
    expect(msg).toContain('TodoWrite')
  })

  it('does not repeat full context from first round', () => {
    const msg = buildAcceptorFollowUpMessage('Report', 3)

    // Should not include the initial context sections
    expect(msg).not.toContain('Files to Review')
    expect(msg).not.toContain('soul.md')
    expect(msg).toContain('Round 3')
  })
})
