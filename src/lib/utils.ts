import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ProjectStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function statusColor(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return 'text-status-sleeping'
    case 'checking': return 'text-status-checking'
    case 'awake': return 'text-status-awake'
    case 'paused': return 'text-status-paused'
    case 'rate_limited': return 'text-status-rate-limited'
  }
}

export function statusIcon(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return '💤'
    case 'checking': return '⟳'
    case 'awake': return '✦'
    case 'paused': return '⚠'
    case 'rate_limited': return '⏱'
  }
}

export function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return 'Sleeping'
    case 'checking': return 'Checking'
    case 'awake': return 'Working'
    case 'paused': return 'Paused'
    case 'rate_limited': return 'Rate Limited'
  }
}

export function statusBgColor(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return 'bg-status-sleeping'
    case 'checking': return 'bg-status-checking'
    case 'awake': return 'bg-status-awake'
    case 'paused': return 'bg-status-paused'
    case 'rate_limited': return 'bg-status-rate-limited'
  }
}
