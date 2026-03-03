import { useMemo } from 'react';
import { AddTodo } from './components/AddTodo';
import { FilterBar } from './components/FilterBar';
import { TodoList } from './components/TodoList';
import { useFilter } from './hooks/useFilter';
import { useTodos } from './hooks/useTodos';
import { filterTodos, sortTodos } from './lib/filtering';

export function App() {
  const { todos, addTodo, toggleTodo, changePriority, deleteTodo } = useTodos();
  const { filters, setPriorityFilter, setStatusFilter } = useFilter();

  const visibleTodos = useMemo(
    () => sortTodos(filterTodos(todos, filters)),
    [todos, filters],
  );

  const totalCount = todos.length;
  const activeCount = todos.filter((t) => !t.completed).length;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Todos
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {activeCount} active / {totalCount} total
        </p>
      </header>

      <section className="mb-6">
        <AddTodo onAdd={addTodo} />
      </section>

      <section className="mb-4">
        <FilterBar
          priorityFilter={filters.priority}
          statusFilter={filters.status}
          onPriorityChange={setPriorityFilter}
          onStatusChange={setStatusFilter}
        />
      </section>

      <section className="flex-1">
        <TodoList
          todos={visibleTodos}
          onToggle={toggleTodo}
          onChangePriority={changePriority}
          onDelete={deleteTodo}
        />
      </section>
    </div>
  );
}
