import type { Todo, FilterState, Priority } from '../types/todo';

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function filterTodos(todos: Todo[], filters: FilterState): Todo[] {
  return todos.filter((todo) => {
    const matchesPriority =
      filters.priority === 'all' || todo.priority === filters.priority;
    const matchesStatus =
      filters.status === 'all' ||
      (filters.status === 'active' && !todo.completed) ||
      (filters.status === 'completed' && todo.completed);
    return matchesPriority && matchesStatus;
  });
}

export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    // Completed todos always go after incomplete ones
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    // Within same completion status, sort by priority
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}
