import { addDays, localDateString, parseDateString, startOfWeek, weekdayOf, zonedParts } from '@/lib/timezone'

/**
 * Laying visits out on a calendar: which local day each belongs to, where
 * it sits in the day, and how visits at the same time share the width.
 * Pure, so the grid is testable without a browser.
 */

export interface CalendarItem {
  id: string
  startsAt: Date
  endsAt: Date
}

export interface PlacedItem<T extends CalendarItem> {
  item: T
  /** Minutes from local midnight; a visit that started the day before is clipped to 0. */
  startMinute: number
  endMinute: number
  /** Which of `columns` side-by-side lanes this visit is in. */
  column: number
  columns: number
}

function minuteOfDay(date: Date, day: string, timezone: string, clampHigh: boolean): number {
  const local = localDateString(date, timezone)
  if (local < day) return 0
  if (local > day) return 1440
  const p = zonedParts(date, timezone)
  const minute = p.hour * 60 + p.minute
  return clampHigh && minute === 0 ? 1440 : minute
}

/** Visits that touch a local day, placed in lanes so overlapping ones sit side by side. */
export function placeDay<T extends CalendarItem>(items: T[], day: string, timezone: string): PlacedItem<T>[] {
  const todays = items
    .filter((item) => localDateString(item.startsAt, timezone) <= day && localDateString(new Date(item.endsAt.getTime() - 1), timezone) >= day)
    .map((item) => ({
      item,
      startMinute: minuteOfDay(item.startsAt, day, timezone, false),
      endMinute: Math.max(minuteOfDay(item.endsAt, day, timezone, true), minuteOfDay(item.startsAt, day, timezone, false) + 15),
    }))
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute)

  const placed: PlacedItem<T>[] = []
  let cluster: PlacedItem<T>[] = []
  let clusterEnd = -1
  const laneEnds: number[] = []
  const close = () => {
    for (const p of cluster) p.columns = laneEnds.length
    cluster = []
    laneEnds.length = 0
  }
  for (const entry of todays) {
    if (entry.startMinute >= clusterEnd) close()
    let lane = laneEnds.findIndex((end) => end <= entry.startMinute)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(entry.endMinute)
    } else laneEnds[lane] = entry.endMinute
    const p: PlacedItem<T> = { ...entry, column: lane, columns: 1 }
    cluster.push(p)
    placed.push(p)
    clusterEnd = Math.max(clusterEnd, entry.endMinute)
  }
  close()
  return placed
}

/** The hours a day grid needs to show: working hours by default, stretched to fit what is booked. */
export function hourRange(placed: Array<{ startMinute: number; endMinute: number }>): { from: number; to: number } {
  let from = 7
  let to = 18
  for (const p of placed) {
    from = Math.min(from, Math.floor(p.startMinute / 60))
    to = Math.max(to, Math.ceil(p.endMinute / 60))
  }
  return { from: Math.max(0, from), to: Math.min(24, to) }
}

export function weekDays(date: string): string[] {
  const monday = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** The six weeks a month view shows, Monday first, padded with the neighbouring months. */
export function monthGrid(date: string): { days: string[]; month: number; year: number } {
  const parsed = parseDateString(date)!
  const first = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-01`
  const start = startOfWeek(first)
  return { days: Array.from({ length: 42 }, (_, i) => addDays(start, i)), month: parsed.month, year: parsed.year }
}

export function monthLabel(date: string): string {
  const parsed = parseDateString(date)!
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)))
}

export function dayLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  const parsed = parseDateString(date)!
  return new Intl.DateTimeFormat('en-AU', { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)))
}

/** Moves the calendar by one page of its view. */
export function shiftDate(date: string, view: 'day' | 'week' | 'month', direction: 1 | -1): string {
  if (view === 'day') return addDays(date, direction)
  if (view === 'week') return addDays(date, 7 * direction)
  const parsed = parseDateString(date)!
  const moved = new Date(Date.UTC(parsed.year, parsed.month - 1 + direction, 1))
  return moved.toISOString().slice(0, 10)
}

export { weekdayOf }
