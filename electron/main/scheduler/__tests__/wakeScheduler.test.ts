import { describe, it, expect } from 'vitest'
import { calculateNextWake } from '../wakeScheduler'
import type { WakeSchedule } from '../../../../src/types/index'

describe('calculateNextWake', () => {
  describe('manual mode', () => {
    it('returns null', () => {
      const schedule: WakeSchedule = { mode: 'manual', intervalMinutes: null, times: [] }
      expect(calculateNextWake(schedule)).toBeNull()
    })
  })

  describe('interval mode', () => {
    it('returns delay based on intervalMinutes', () => {
      const schedule: WakeSchedule = { mode: 'interval', intervalMinutes: 30, times: [] }
      const now = new Date('2026-03-01T12:00:00Z').getTime()
      const result = calculateNextWake(schedule, now)

      expect(result).not.toBeNull()
      expect(result!.delayMs).toBe(30 * 60 * 1000)
      expect(result!.nextWakeTime).toBe(new Date(now + 30 * 60 * 1000).toISOString())
    })

    it('returns null when intervalMinutes is null', () => {
      const schedule: WakeSchedule = { mode: 'interval', intervalMinutes: null, times: [] }
      expect(calculateNextWake(schedule)).toBeNull()
    })

    it('returns null when intervalMinutes is 0', () => {
      const schedule: WakeSchedule = { mode: 'interval', intervalMinutes: 0, times: [] }
      expect(calculateNextWake(schedule)).toBeNull()
    })
  })

  describe('times mode', () => {
    it('returns delay to the nearest future time', () => {
      const schedule: WakeSchedule = { mode: 'times', intervalMinutes: null, times: ['14:00', '18:00'] }
      // Set "now" to 13:00 local time
      const now = new Date()
      now.setHours(13, 0, 0, 0)
      const nowMs = now.getTime()

      const result = calculateNextWake(schedule, nowMs)

      expect(result).not.toBeNull()
      // Should wake at 14:00 (1 hour from now)
      expect(result!.delayMs).toBe(60 * 60 * 1000)
    })

    it('wraps to next day when all times have passed', () => {
      const schedule: WakeSchedule = { mode: 'times', intervalMinutes: null, times: ['09:00'] }
      // Set "now" to 22:00 local time
      const now = new Date()
      now.setHours(22, 0, 0, 0)
      const nowMs = now.getTime()

      const result = calculateNextWake(schedule, nowMs)

      expect(result).not.toBeNull()
      // Should wake at 09:00 next day (11 hours from now)
      expect(result!.delayMs).toBe(11 * 60 * 60 * 1000)
    })

    it('picks the closest time among multiple options', () => {
      const schedule: WakeSchedule = { mode: 'times', intervalMinutes: null, times: ['15:00', '14:00', '16:00'] }
      const now = new Date()
      now.setHours(13, 30, 0, 0)
      const nowMs = now.getTime()

      const result = calculateNextWake(schedule, nowMs)

      expect(result).not.toBeNull()
      // 14:00 is closest (30 min away)
      expect(result!.delayMs).toBe(30 * 60 * 1000)
    })

    it('returns null for empty times array', () => {
      const schedule: WakeSchedule = { mode: 'times', intervalMinutes: null, times: [] }
      expect(calculateNextWake(schedule)).toBeNull()
    })
  })
})
