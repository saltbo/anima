import type { WakeSchedule } from '../../../src/types/index'

export interface WakeDelay {
  delayMs: number
  nextWakeTime: string
}

/**
 * Calculate the next wake delay based on the schedule configuration.
 * Returns null if the schedule is manual or has no valid configuration.
 */
export function calculateNextWake(schedule: WakeSchedule, now = Date.now()): WakeDelay | null {
  if (schedule.mode === 'manual') return null

  if (schedule.mode === 'interval' && schedule.intervalMinutes) {
    const delayMs = schedule.intervalMinutes * 60 * 1000
    return {
      delayMs,
      nextWakeTime: new Date(now + delayMs).toISOString(),
    }
  }

  if (schedule.mode === 'times' && schedule.times.length > 0) {
    const nowDate = new Date(now)
    let minDiff = Infinity

    for (const t of schedule.times) {
      const [h, m] = t.split(':').map(Number)
      const next = new Date(nowDate)
      next.setHours(h, m, 0, 0)
      if (next.getTime() <= now) next.setDate(next.getDate() + 1)
      const diff = next.getTime() - now
      if (diff < minDiff) minDiff = diff
    }

    if (minDiff < Infinity) {
      return {
        delayMs: minDiff,
        nextWakeTime: new Date(now + minDiff).toISOString(),
      }
    }
  }

  return null
}
