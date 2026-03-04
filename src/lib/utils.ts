import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ProjectStatus, MilestoneStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function statusColor(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return 'text-status-sleeping'
    case 'idle': return 'text-status-checking'
    case 'busy': return 'text-status-awake'
    case 'paused': return 'text-status-paused'
    case 'rate_limited': return 'text-status-rate-limited'
  }
}

export function statusIcon(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return '💤'
    case 'idle': return '⟳'
    case 'busy': return '✦'
    case 'paused': return '⚠'
    case 'rate_limited': return '⏱'
  }
}

export function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return 'Sleeping'
    case 'idle': return 'Idle'
    case 'busy': return 'Working'
    case 'paused': return 'Paused'
    case 'rate_limited': return 'Rate Limited'
  }
}

export function statusBgColor(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return 'bg-status-sleeping'
    case 'idle': return 'bg-status-checking'
    case 'busy': return 'bg-status-awake'
    case 'paused': return 'bg-status-paused'
    case 'rate_limited': return 'bg-status-rate-limited'
  }
}

export function milestoneStatusLabel(status: MilestoneStatus): string {
  switch (status) {
    case 'draft': return 'Draft'
    case 'planning': return 'Planning…'
    case 'planned': return 'Planned'
    case 'ready': return 'Ready'
    case 'in_progress': return 'In Progress'
    case 'in_review': return 'In Review'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    case 'closed': return 'Closed'
  }
}

export function milestoneStatusBadgeClass(status: MilestoneStatus): string {
  switch (status) {
    case 'draft': return 'bg-muted text-muted-foreground'
    case 'planning': return 'bg-yellow-500/10 text-yellow-600'
    case 'planned': return 'bg-blue-500/10 text-blue-600'
    case 'ready': return 'bg-primary/10 text-primary'
    case 'in_progress': return 'bg-purple-500/10 text-purple-600'
    case 'in_review': return 'bg-amber-500/10 text-amber-600'
    case 'completed': return 'bg-green-500/10 text-green-600'
    case 'cancelled': return 'bg-red-500/10 text-red-600'
    case 'closed': return 'bg-muted text-muted-foreground'
  }
}

export function milestoneStatusDotClass(status: MilestoneStatus): string {
  switch (status) {
    case 'draft': return 'bg-muted-foreground'
    case 'planning': return 'bg-yellow-500'
    case 'planned': return 'bg-blue-500'
    case 'ready': return 'bg-primary'
    case 'in_progress': return 'bg-purple-500'
    case 'in_review': return 'bg-amber-500'
    case 'completed': return 'bg-green-500'
    case 'cancelled': return 'bg-red-500'
    case 'closed': return 'bg-muted-foreground'
  }
}
