import { useCallback, useState } from 'react';
import type { Priority, Todo } from '../types/todo';

function generateId(): string {
  return crypto.randomUUID();
}

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const addTodo = useCallback((text: string, priority: Priority = 'medium') => {
    const todo: Todo = {
      id: generateId(),
      text: text.trim(),
      priority,
      completed: false,
    };
    setTodos((prev) => [...prev, todo]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
  }, []);

  const changePriority = useCallback((id: string, priority: Priority) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, priority } : todo,
      ),
    );
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  }, []);

  return { todos, addTodo, toggleTodo, changePriority, deleteTodo } as const;
}
