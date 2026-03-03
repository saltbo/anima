import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

/** "a few seconds ago", "3 days ago", "a month ago" */
export function timeAgo(iso: string): string {
  return dayjs(iso).fromNow()
}

/** "<1m", "5m", "2h 15m", "3d" — compact elapsed time */
export function formatElapsed(start?: string, end?: string): string {
  if (!start) return '—'
  const s = dayjs(start)
  const e = end ? dayjs(end) : dayjs()
  const mins = e.diff(s, 'minute')
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) {
    const rem = mins % 60
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
  }
  return `${e.diff(s, 'day')}d`
}

/** "1.5M", "12.3K", "500" */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n > 0 ? String(n) : '—'
}

/** "14:30" — short local time display */
export function formatTime(iso: string): string {
  return dayjs(iso).format('HH:mm')
}

/** Current time as ISO string */
export function nowISO(): string {
  return dayjs().toISOString()
}
