import { describe, it, expect } from 'vitest'
import {
  parseTodoWrite,
  mergeTodosIntoTasks,
  mergeTodosIntoAC,
  captureDeveloperTodos,
  captureAcceptorTodos,
} from '../todoCapture'
import type { Milestone } from '../../../../src/types/index'

// ── parseTodoWrite ──────────────────────────────────────────────────────────

describe('parseTodoWrite', () => {
  it('parses valid JSON with todos array', () => {
    const input = JSON.stringify({
      todos: [
        { id: 't1', content: 'Add login', status: 'completed' },
        { id: 't2', content: 'Add signup', status: 'pending' },
      ],
    })
    const result = parseTodoWrite(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 't1', content: 'Add login', status: 'completed' })
    expect(result[1]).toEqual({ id: 't2', content: 'Add signup', status: 'pending' })
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseTodoWrite('not-json')).toEqual([])
  })

  it('returns empty array when todos key is missing', () => {
    expect(parseTodoWrite(JSON.stringify({ other: 'data' }))).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseTodoWrite('')).toEqual([])
  })
})

// ── mergeTodosIntoTasks ─────────────────────────────────────────────────────

describe('mergeTodosIntoTasks', () => {
  it('adds new tasks when none exist', () => {
    const todos = [
      { id: 't1', content: 'Task one', status: 'pending' as const },
      { id: 't2', content: 'Task two', status: 'completed' as const },
    ]
    const result = mergeTodosIntoTasks([], todos, 1)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 't1', title: 'Task one', completed: false, order: 0, iteration: 1 })
    expect(result[1]).toMatchObject({ id: 't2', title: 'Task two', completed: true, order: 1, iteration: 1 })
  })

  it('updates existing tasks by id', () => {
    const existing = [
      { id: 't1', title: 'Task one', completed: false, order: 0, iteration: 1 },
    ]
    const todos = [
      { id: 't1', content: 'Task one updated', status: 'completed' as const },
    ]
    const result = mergeTodosIntoTasks(existing, todos, 2)

    expect(result).toHaveLength(1)
    expect(result[0].completed).toBe(true)
  })

  it('generates UUID for todos without id', () => {
    const todos = [{ id: '', content: 'No id task', status: 'pending' as const }]
    const result = mergeTodosIntoTasks([], todos, 1)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBeTruthy()
    expect(result[0].id).not.toBe('')
  })

  it('does not mutate the original array', () => {
    const original = [{ id: 't1', title: 'Task', completed: false, order: 0, iteration: 1 }]
    const todos = [{ id: 't2', content: 'New', status: 'pending' as const }]
    const result = mergeTodosIntoTasks(original, todos, 1)

    expect(result).toHaveLength(2)
    expect(original).toHaveLength(1)
  })
})

// ── mergeTodosIntoAC ────────────────────────────────────────────────────────

describe('mergeTodosIntoAC', () => {
  it('adds new acceptance criteria', () => {
    const todos = [
      { id: 'a1', content: 'Login works', status: 'completed' as const },
      { id: 'a2', content: 'Signup works', status: 'pending' as const },
    ]
    const result = mergeTodosIntoAC([], todos, 1)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ title: 'Login works', status: 'passed', iteration: 1 })
    expect(result[1]).toMatchObject({ title: 'Signup works', status: 'pending', iteration: 1 })
  })

  it('updates existing AC by title + iteration', () => {
    const existing = [
      { title: 'Login works', status: 'pending' as const, iteration: 1 },
    ]
    const todos = [
      { id: 'a1', content: 'Login works', status: 'completed' as const },
    ]
    const result = mergeTodosIntoAC(existing, todos, 1)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('passed')
  })

  it('does not update AC from different iteration', () => {
    const existing = [
      { title: 'Login works', status: 'pending' as const, iteration: 1 },
    ]
    const todos = [
      { id: 'a1', content: 'Login works', status: 'completed' as const },
    ]
    const result = mergeTodosIntoAC(existing, todos, 2)

    // Should add as new, not update existing from iteration 1
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('pending') // iteration 1 unchanged
    expect(result[1].status).toBe('passed')  // new entry for iteration 2
  })

  it('maps in_progress status to rejected', () => {
    const todos = [
      { id: 'a1', content: 'Feature X', status: 'in_progress' as const },
    ]
    const result = mergeTodosIntoAC([], todos, 1)

    expect(result[0].status).toBe('rejected')
  })
})

// ── captureDeveloperTodos ───────────────────────────────────────────────────

describe('captureDeveloperTodos', () => {
  const baseMilestone: Milestone = {
    id: 'm-1',
    title: 'Test',
    description: 'Test milestone',
    status: 'in-progress',
    acceptanceCriteria: [],
    tasks: [],

    createdAt: '2026-01-01',
    iterationCount: 0,
    iterations: [],
  }

  it('returns null for empty todos', () => {
    expect(captureDeveloperTodos(baseMilestone, [], 1)).toBeNull()
  })

  it('returns updated milestone with new tasks', () => {
    const todos = [{ id: 't1', content: 'Add login', status: 'pending' as const }]
    const result = captureDeveloperTodos(baseMilestone, todos, 1)

    expect(result).not.toBeNull()
    expect(result!.tasks).toHaveLength(1)
    expect(result!.tasks[0].title).toBe('Add login')
  })

  it('does not mutate original milestone', () => {
    const todos = [{ id: 't1', content: 'New task', status: 'pending' as const }]
    captureDeveloperTodos(baseMilestone, todos, 1)

    expect(baseMilestone.tasks).toHaveLength(0)
  })
})

// ── captureAcceptorTodos ────────────────────────────────────────────────────

describe('captureAcceptorTodos', () => {
  const baseMilestone: Milestone = {
    id: 'm-1',
    title: 'Test',
    description: 'Test milestone',
    status: 'in-progress',
    acceptanceCriteria: [],
    tasks: [],

    createdAt: '2026-01-01',
    iterationCount: 0,
    iterations: [],
  }

  it('returns null for empty todos', () => {
    expect(captureAcceptorTodos(baseMilestone, [], 1)).toBeNull()
  })

  it('returns updated milestone with acceptance criteria', () => {
    const todos = [{ id: 'a1', content: 'Login works', status: 'completed' as const }]
    const result = captureAcceptorTodos(baseMilestone, todos, 1)

    expect(result).not.toBeNull()
    expect(result!.acceptanceCriteria).toHaveLength(1)
    expect(result!.acceptanceCriteria[0].status).toBe('passed')
  })
})
