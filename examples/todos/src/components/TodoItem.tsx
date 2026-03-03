import type { Priority, Todo } from '../types/todo';
import { PriorityBadge } from './PriorityBadge';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onChangePriority: (id: string, priority: Priority) => void;
  onDelete: (id: string) => void;
}

const PRIORITY_CYCLE: Priority[] = ['low', 'medium', 'high'];

function nextPriority(current: Priority): Priority {
  const idx = PRIORITY_CYCLE.indexOf(current);
  return PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
}

export function TodoItem({ todo, onToggle, onChangePriority, onDelete }: TodoItemProps) {
  const handlePriorityClick = () => {
    onChangePriority(todo.id, nextPriority(todo.priority));
  };

  return (
    <li
      className={`group flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors
                  ${
                    todo.completed
                      ? 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
                      : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                  }`}
    >
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600
                   focus:ring-indigo-500 dark:border-gray-600"
      />

      <span
        className={`flex-1 text-sm ${
          todo.completed
            ? 'text-gray-400 line-through dark:text-gray-500'
            : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {todo.text}
      </span>

      <button
        type="button"
        onClick={handlePriorityClick}
        title={`Priority: ${todo.priority} — click to cycle`}
        className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 rounded-full"
      >
        <PriorityBadge priority={todo.priority} />
      </button>

      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        className="rounded p-1 text-gray-400 opacity-0 transition-opacity
                   hover:text-red-500 focus:opacity-100 focus:outline-none
                   group-hover:opacity-100 dark:text-gray-500 dark:hover:text-red-400"
        title="Delete todo"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </li>
  );
}
