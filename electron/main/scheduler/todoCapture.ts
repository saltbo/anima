import { randomUUID } from 'crypto'
import type { Milestone, MilestoneTask, AcceptanceCriterion } from '../../../src/types/index'

// ── TodoWrite parser ──────────────────────────────────────────────────────────

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export function parseTodoWrite(toolInput: string): TodoItem[] {
  try {
    const parsed = JSON.parse(toolInput) as { todos?: TodoItem[] }
    return parsed.todos ?? []
  } catch {
    return []
  }
}

// ── Capture helpers ───────────────────────────────────────────────────────────

export function mergeTodosIntoTasks(
  tasks: MilestoneTask[],
  todos: TodoItem[],
  iteration: number
): MilestoneTask[] {
  const result = [...tasks]
  for (const todo of todos) {
    const existing = result.find((t) => t.id === todo.id)
    if (existing) {
      existing.completed = todo.status === 'completed'
    } else {
      result.push({
        id: todo.id || randomUUID(),
        title: todo.content,
        completed: todo.status === 'completed',
        order: result.length,
        iteration,
      })
    }
  }
  return result
}

export function mergeTodosIntoAC(
  criteria: AcceptanceCriterion[],
  todos: TodoItem[],
  iteration: number
): AcceptanceCriterion[] {
  const result = [...criteria]
  for (const todo of todos) {
    const existing = result.find((ac) => ac.title === todo.content && ac.iteration === iteration)
    if (existing) {
      existing.status = todo.status === 'completed' ? 'passed' : 'pending'
    } else {
      result.push({
        title: todo.content,
        status: todo.status === 'completed' ? 'passed' : todo.status === 'pending' ? 'pending' : 'rejected',
        iteration,
      })
    }
  }
  return result
}

/** Check if a milestone has changed after merging todos */
export function captureDeveloperTodos(
  milestone: Milestone,
  todos: TodoItem[],
  iteration: number
): Milestone | null {
  if (todos.length === 0) return null
  const newTasks = mergeTodosIntoTasks(milestone.tasks, todos, iteration)
  if (newTasks.length === milestone.tasks.length && newTasks.every((t, i) => t.completed === milestone.tasks[i]?.completed)) {
    return null
  }
  return { ...milestone, tasks: newTasks }
}

export function captureAcceptorTodos(
  milestone: Milestone,
  todos: TodoItem[],
  iteration: number
): Milestone | null {
  if (todos.length === 0) return null
  const newAC = mergeTodosIntoAC(milestone.acceptanceCriteria, todos, iteration)
  return { ...milestone, acceptanceCriteria: newAC }
}
