import { describe, it, expect } from 'vitest'
import {
  buildDeveloperSystemPrompt,
  buildAcceptorSystemPrompt,
  buildDeveloperFirstMessage,
  buildAcceptorFirstMessage,
  buildContinueMessage,
} from '../prompts'

describe('buildDeveloperSystemPrompt', () => {
  it('references MCP tools instead of TodoWrite', () => {
    const prompt = buildDeveloperSystemPrompt()
    expect(prompt).toContain('Anima MCP tools')
    expect(prompt).toContain('add_comment')
    expect(prompt).toContain('developer')
  })
})

describe('buildAcceptorSystemPrompt', () => {
  it('references MCP tools and status semantics', () => {
    const prompt = buildAcceptorSystemPrompt()
    expect(prompt).toContain('passed')
    expect(prompt).toContain('in_progress')
    expect(prompt).toContain('functional testing')
    expect(prompt).toContain('Anima MCP tools')
    expect(prompt).toContain('acceptance criteria')
  })
})

describe('buildDeveloperFirstMessage', () => {
  it('includes milestone ID, branch, and iteration count', () => {
    const msg = buildDeveloperFirstMessage({
      milestoneId: 'm-1',
      branch: 'milestone/m-1',
      iterationCount: 3,
    })

    expect(msg).toContain('milestone/m-1')
    expect(msg).toContain('Iteration: 3')
    expect(msg).toContain('m-1')
    expect(msg).toContain('get_milestone')
    expect(msg).toContain('list_comments')
  })
})

describe('buildAcceptorFirstMessage', () => {
  it('includes milestone ID and iteration count', () => {
    const msg = buildAcceptorFirstMessage({
      milestoneId: 'm-1',
      iterationCount: 2,
    })

    expect(msg).toContain('m-1')
    expect(msg).toContain('Iteration: 2')
    expect(msg).toContain('get_milestone')
    expect(msg).toContain('update_acceptance_criteria')
  })
})

describe('buildContinueMessage', () => {
  it('developer continue references list_comments and add_comment', () => {
    const msg = buildContinueMessage('developer', 'm-1')

    expect(msg).toContain('list_comments')
    expect(msg).toContain('add_comment')
    expect(msg).toContain('Fix')
  })

  it('acceptor continue references list_comments and update_acceptance_criteria', () => {
    const msg = buildContinueMessage('acceptor', 'm-1')

    expect(msg).toContain('list_comments')
    expect(msg).toContain('update_acceptance_criteria')
  })
})
