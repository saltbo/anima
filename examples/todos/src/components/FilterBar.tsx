import type { PriorityFilter, StatusFilter } from '../types/todo';

interface FilterBarProps {
  priorityFilter: PriorityFilter;
  statusFilter: StatusFilter;
  onPriorityChange: (filter: PriorityFilter) => void;
  onStatusChange: (filter: StatusFilter) => void;
}

const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}:
      </span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors
                        ${
                          value === opt.value
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilterBar({
  priorityFilter,
  statusFilter,
  onPriorityChange,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <FilterGroup
        label="Priority"
        options={PRIORITY_OPTIONS}
        value={priorityFilter}
        onChange={onPriorityChange}
      />
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
      <FilterGroup
        label="Status"
        options={STATUS_OPTIONS}
        value={statusFilter}
        onChange={onStatusChange}
      />
    </div>
  );
}
