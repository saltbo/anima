import { describe, it, expect } from 'vitest'
import { isRateLimitError, parseResetTime, RATE_LIMIT_FALLBACK_MS } from '../rateLimit'

describe('isRateLimitError', () => {
  it('detects "rate limit" (case insensitive)', () => {
    expect(isRateLimitError('Rate limit exceeded')).toBe(true)
    expect(isRateLimitError('rate_limit_error')).toBe(true)
    expect(isRateLimitError('RATE LIMIT')).toBe(true)
  })

  it('detects "quota"', () => {
    expect(isRateLimitError('Quota exceeded for model')).toBe(true)
  })

  it('detects "too many requests"', () => {
    expect(isRateLimitError('Too many requests, please wait')).toBe(true)
  })

  it('detects HTTP 429', () => {
    expect(isRateLimitError('HTTP 429 - Too Many Requests')).toBe(true)
    expect(isRateLimitError('Error code: 429')).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isRateLimitError('Connection timeout')).toBe(false)
    expect(isRateLimitError('Authentication failed')).toBe(false)
    expect(isRateLimitError('Internal server error')).toBe(false)
  })
})

describe('parseResetTime', () => {
  it('extracts ISO timestamp from message', () => {
    const msg = 'Rate limit resets at 2026-03-01T15:30:00Z, please wait'
    const result = parseResetTime(msg)
    expect(result).toBe('2026-03-01T15:30:00Z')
  })

  it('extracts ISO timestamp with milliseconds', () => {
    const msg = 'Reset at 2026-03-01T15:30:00.123Z'
    const result = parseResetTime(msg)
    expect(result).toBe('2026-03-01T15:30:00.123Z')
  })

  it('falls back to now + RATE_LIMIT_FALLBACK_MS when no timestamp found', () => {
    const now = new Date('2026-03-01T12:00:00Z').getTime()
    const result = parseResetTime('Rate limit exceeded', now)
    const expected = new Date(now + RATE_LIMIT_FALLBACK_MS).toISOString()
    expect(result).toBe(expected)
  })

  it('uses current time as default for now parameter', () => {
    const before = Date.now()
    const result = parseResetTime('No timestamp here')
    const after = Date.now()

    const resetTime = new Date(result).getTime()
    // Should be approximately now + 60 minutes
    expect(resetTime).toBeGreaterThanOrEqual(before + RATE_LIMIT_FALLBACK_MS)
    expect(resetTime).toBeLessThanOrEqual(after + RATE_LIMIT_FALLBACK_MS)
  })
})
