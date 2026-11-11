/**
 * Time zones without a library.
 *
 * Appointments are stored in UTC and shown in the business's own zone.
 * Converting a wall-clock time ("9:30 on 4 October in Sydney") to UTC has
 * two awkward hours a year in zones with daylight saving: the hour that
 * doesn't exist when clocks go forward, and the hour that happens twice
 * when they go back. Both are handled here and tested for Sydney.
 */

export const AU_TIMEZONES: Array<{ id: string; label: string }> = [
  { id: 'Australia/Sydney', label: 'Sydney, Canberra (NSW, ACT)' },
  { id: 'Australia/Melbourne', label: 'Melbourne (VIC)' },
  { id: 'Australia/Brisbane', label: 'Brisbane (QLD)' },
  { id: 'Australia/Adelaide', label: 'Adelaide (SA)' },
  { id: 'Australia/Darwin', label: 'Darwin (NT)' },
  { id: 'Australia/Perth', label: 'Perth (WA)' },
  { id: 'Australia/Hobart', label: 'Hobart (TAS)' },
  { id: 'Australia/Broken_Hill', label: 'Broken Hill (NSW)' },
  { id: 'Australia/Lord_Howe', label: 'Lord Howe Island' },
]

export function isAuTimezone(value: string): boolean {
  return AU_TIMEZONES.some((zone) => zone.id === value)
}

const STATE_ZONE: Record<string, string> = {
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  NT: 'Australia/Darwin',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
}

export function timezoneForState(state: string | null | undefined): string {
  return (state && STATE_ZONE[state]) || 'Australia/Sydney'
}

export interface LocalDateTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
    formatters.set(timezone, formatter)
  }
  return formatter
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The wall-clock reading of an instant in a zone. `weekday` is 0 (Sunday) to 6. */
export function zonedParts(date: Date, timezone: string): LocalDateTime & { weekday: number } {
  const parts: Record<string, string> = {}
  for (const part of partsFormatter(timezone).formatToParts(date)) parts[part.type] = part.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday.slice(0, 3)),
  }
}

/** Minutes the zone is ahead of UTC at an instant (Sydney: 600 or 660). */
export function offsetMinutes(date: Date, timezone: string): number {
  const p = zonedParts(date, timezone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}

export type ZonedResult =
  | { ok: true; utc: Date; /** The time happens twice that day (clocks going back); the first is used. */ ambiguous: boolean }
  | { ok: false; reason: 'gap' | 'invalid' }

/**
 * The instant a wall-clock time names in a zone. A time skipped by clocks
 * going forward is refused rather than silently moved; a time repeated by
 * clocks going back resolves to its first occurrence.
 */
export function zonedToUtc(local: LocalDateTime, timezone: string): ZonedResult {
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  if (!Number.isFinite(naive)) return { ok: false, reason: 'invalid' }
  // A real calendar date and time (31 February is not).
  const check = new Date(naive)
  if (
    check.getUTCFullYear() !== local.year ||
    check.getUTCMonth() !== local.month - 1 ||
    check.getUTCDate() !== local.day ||
    local.hour < 0 ||
    local.hour > 23 ||
    local.minute < 0 ||
    local.minute > 59
  )
    return { ok: false, reason: 'invalid' }

  const candidates = new Set<number>()
  for (const probe of [naive - 86_400_000, naive, naive + 86_400_000]) {
    candidates.add(naive - offsetMinutes(new Date(probe), timezone) * 60_000)
  }
  const matches = [...candidates]
    .filter((instant) => {
      const p = zonedParts(new Date(instant), timezone)
      return p.year === local.year && p.month === local.month && p.day === local.day && p.hour === local.hour && p.minute === local.minute
    })
    .sort((a, b) => a - b)
  if (matches.length === 0) return { ok: false, reason: 'gap' }
  return { ok: true, utc: new Date(matches[0]), ambiguous: matches.length > 1 }
}

/** "2026-10-04" for an instant, in a zone. */
export function localDateString(date: Date, timezone: string): string {
  const p = zonedParts(date, timezone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** "09:30" for an instant, in a zone. */
export function localTimeString(date: Date, timezone: string): string {
  const p = zonedParts(date, timezone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{2}):(\d{2})$/

export function parseDateString(value: string): { year: number; month: number; day: number } | null {
  const match = DATE.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null
}

export function parseTimeString(value: string): { hour: number; minute: number } | null {
  const match = TIME.exec(value)
  if (!match) return null
  const [hour, minute] = [Number(match[1]), Number(match[2])]
  return hour <= 23 && minute <= 59 ? { hour, minute } : null
}

/** Calendar arithmetic on a date string; no time zone involved. */
export function addDays(date: string, days: number): string {
  const parsed = parseDateString(date)
  if (!parsed) return date
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days)).toISOString().slice(0, 10)
}

/** 0 (Sunday) to 6 for a date string. */
export function weekdayOf(date: string): number {
  const parsed = parseDateString(date)
  return parsed ? new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay() : 0
}

/** The Monday on or before a date. */
export function startOfWeek(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

/**
 * The UTC instants a local day starts and ends at. A day is 23 or 25
 * hours long when the clocks change, which this gets right because each
 * end is converted on its own.
 */
export function dayRange(date: string, timezone: string): { start: Date; end: Date } | null {
  const parsed = parseDateString(date)
  const next = parseDateString(addDays(date, 1))
  if (!parsed || !next) return null
  const start = zonedToUtc({ ...parsed, hour: 0, minute: 0 }, timezone)
  const end = zonedToUtc({ ...next, hour: 0, minute: 0 }, timezone)
  if (!start.ok || !end.ok) return null
  return { start: start.utc, end: end.utc }
}

export function formatInZone(date: Date, timezone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: timezone, ...options }).format(date)
}

/** "Mon 5 Oct, 9:30 am" in the zone. */
export function formatWhen(date: Date, timezone: string): string {
  return formatInZone(date, timezone, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** "9:30 am – 11:00 am" in the zone. */
export function formatTimeRange(start: Date, end: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  return `${formatInZone(start, timezone, options)} – ${formatInZone(end, timezone, options)}`
}

/** "AEDT" or "AEST" for an instant in the zone. */
export function zoneAbbreviation(date: Date, timezone: string): string {
  const part = new Intl.DateTimeFormat('en-AU', { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? ''
}
