import { useCallback, useState } from 'react';
import type { FilterState, PriorityFilter, StatusFilter } from '../types/todo';

const INITIAL_FILTER: FilterState = {
  priority: 'all',
  status: 'all',
};

export function useFilter() {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTER);

  const setPriorityFilter = useCallback((priority: PriorityFilter) => {
    setFilters((prev) => ({ ...prev, priority }));
  }, []);

  const setStatusFilter = useCallback((status: StatusFilter) => {
    setFilters((prev) => ({ ...prev, status }));
  }, []);

  return { filters, setPriorityFilter, setStatusFilter } as const;
}
