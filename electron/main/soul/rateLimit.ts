import dayjs from 'dayjs'

export const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000 // 60 minutes

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /quota/i,
  /too many requests/i,
  /429/,
  /402/,
]

export function isRateLimitError(message: string): boolean {
  return RATE_LIMIT_PATTERNS.some((p) => p.test(message))
}

export function parseResetTime(message: string, now = dayjs().valueOf()): string {
  const timeMatch = message.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/)
  if (timeMatch) {
    return timeMatch[1]
  }
  return dayjs(now + RATE_LIMIT_FALLBACK_MS).toISOString()
}
