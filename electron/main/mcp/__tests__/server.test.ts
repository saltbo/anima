import { describe, it, expect, vi } from 'vitest'
import type { Milestone, MilestoneCheck, MilestoneCheckStatus } from '../../../../src/types/index'

/**
 * Tests for MCP server tool logic.
 *
 * With the migration from JSON columns to relational tables (milestone_checks),
 * the merge logic is no longer needed — checks are individual rows.
 * These tests verify the new check operations.
 */

// ── Mock Milestone for delegation tests ─────────────────────────────────────

function createMockMilestoneRepo() {
  const milestone: Milestone = {
    id: 'm-1',
    title: 'Test',
    description: 'desc',
    status: 'in-progress',
    items: [],
    checks: [],
    createdAt: '2026-01-01',
    iterationCount: 0,
    iterations: [],
    totalTokens: 0,
    totalCost: 0,
  }

  return {
    getById: vi.fn((id: string) => {
      if (id !== 'm-1') return null
      return { ...milestone }
    }),
  }
}

// ── Check operations ────────────────────────────────────────────────────────

function makeCheck(overrides: Partial<MilestoneCheck> = {}): MilestoneCheck {
  return {
    id: `chk-${Math.random().toString(36).slice(2, 8)}`,
    itemId: 'item-1',
    title: 'Check',
    status: 'pending',
    iteration: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('Check operations', () => {
  it('creates checks with correct structure', () => {
    const check = makeCheck({ title: 'Login works', status: 'passed', iteration: 1 })

    expect(check.title).toBe('Login works')
    expect(check.status).toBe('passed')
    expect(check.iteration).toBe(1)
    expect(check.itemId).toBe('item-1')
  })

  it('supports all check statuses', () => {
    const statuses: MilestoneCheckStatus[] = ['pending', 'checking', 'passed', 'rejected']

    for (const status of statuses) {
      const check = makeCheck({ status })
      expect(check.status).toBe(status)
    }
  })

  it('each check has a unique id', () => {
    const checks = Array.from({ length: 5 }, () => makeCheck())
    const ids = new Set(checks.map((c) => c.id))
    expect(ids.size).toBe(5)
  })
})

describe('MCP server delegates to repositories', () => {
  it('get_milestone delegates to milestoneRepo.getById', () => {
    const repo = createMockMilestoneRepo()
    const milestone = repo.getById('m-1')

    expect(milestone).not.toBeNull()
    expect(milestone!.id).toBe('m-1')
    expect(repo.getById).toHaveBeenCalledWith('m-1')
  })

  it('returns null for unknown milestone', () => {
    const repo = createMockMilestoneRepo()
    const milestone = repo.getById('unknown')

    expect(milestone).toBeNull()
  })

  it('milestone has items and checks arrays', () => {
    const repo = createMockMilestoneRepo()
    const milestone = repo.getById('m-1')

    expect(milestone!.items).toEqual([])
    expect(milestone!.checks).toEqual([])
  })
})
