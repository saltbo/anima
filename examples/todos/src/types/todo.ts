export type Priority = 'high' | 'medium' | 'low';

export type StatusFilter = 'all' | 'active' | 'completed';

export type PriorityFilter = 'all' | Priority;

export interface Todo {
  id: string;
  text: string;
  priority: Priority;
  completed: boolean;
}

export interface FilterState {
  priority: PriorityFilter;
  status: StatusFilter;
}
