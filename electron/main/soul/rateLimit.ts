import dayjs from 'dayjs'

export const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000 // 60 minutes

/** Error codes from the Anthropic API that indicate rate/usage limits */
const RATE_LIMIT_CODES = new Set([
  'rate_limit_error',     // API 429
  'overloaded_error',     // API 529
])

/** Check if an error code indicates a rate/usage limit */
export function isRateLimitCode(code: string | undefined): boolean {
  return code !== undefined && RATE_LIMIT_CODES.has(code)
}

export function parseResetTime(message: string, now = dayjs().valueOf()): string {
  const timeMatch = message.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/)
  if (timeMatch) {
    return timeMatch[1]
  }
  return dayjs(now + RATE_LIMIT_FALLBACK_MS).toISOString()
}
