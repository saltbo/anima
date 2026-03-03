import dayjs from 'dayjs'

/** Current time as ISO string */
export function nowISO(): string {
  return dayjs().toISOString()
}

/** Convert ms-since-epoch to ISO string */
export function msToISO(ms: number): string {
  return dayjs(ms).toISOString()
}

/** Parse ISO string to ms-since-epoch */
export function isoToMs(iso: string): number {
  return dayjs(iso).valueOf()
}

/** Milliseconds from now until a future ISO timestamp */
export function msUntil(iso: string): number {
  return Math.max(0, dayjs(iso).valueOf() - dayjs().valueOf())
}

/** ISO string for (now + ms) */
export function nowPlusMs(ms: number): string {
  return dayjs().add(ms, 'millisecond').toISOString()
}
