import type { Priority, Todo } from '../types/todo';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onChangePriority: (id: string, priority: Priority) => void;
  onDelete: (id: string) => void;
}

export function TodoList({ todos, onToggle, onChangePriority, onDelete }: TodoListProps) {
  if (todos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
        No todos match the current filters.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onChangePriority={onChangePriority}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
