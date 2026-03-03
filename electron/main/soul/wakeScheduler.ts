import dayjs from 'dayjs'
import { msToISO } from '../lib/time'
import type { WakeSchedule } from '../../../src/types/index'

export interface WakeDelay {
  delayMs: number
  nextWakeTime: string
}

/**
 * Calculate the next wake delay based on the schedule configuration.
 * Returns null if the schedule is manual or has no valid configuration.
 */
export function calculateNextWake(schedule: WakeSchedule, now = dayjs().valueOf()): WakeDelay | null {
  if (schedule.mode === 'manual') return null

  if (schedule.mode === 'interval' && schedule.intervalMinutes) {
    const delayMs = schedule.intervalMinutes * 60 * 1000
    return {
      delayMs,
      nextWakeTime: msToISO(now + delayMs),
    }
  }

  if (schedule.mode === 'times' && schedule.times.length > 0) {
    const nowD = dayjs(now)
    let minDiff = Infinity

    for (const t of schedule.times) {
      const [h, m] = t.split(':').map(Number)
      let next = nowD.hour(h).minute(m).second(0).millisecond(0)
      if (next.valueOf() <= now) next = next.add(1, 'day')
      const diff = next.valueOf() - now
      if (diff < minDiff) minDiff = diff
    }

    if (minDiff < Infinity) {
      return {
        delayMs: minDiff,
        nextWakeTime: msToISO(now + minDiff),
      }
    }
  }

  return null
}
