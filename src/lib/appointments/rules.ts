import { zonedParts, zonedToUtc, parseDateString, parseTimeString } from '@/lib/timezone'

/**
 * The rules of the calendar, as pure functions: turning a form's date,
 * time and length into a UTC range in the business's zone, which states a
 * visit can move between, and the soft warnings a booking can carry.
 */

export const APPOINTMENT_KINDS = [
  { id: 'MEASURE', label: 'Measure', minutes: 45 },
  { id: 'INSTALL', label: 'Installation', minutes: 240 },
  { id: 'SERVICE', label: 'Service', minutes: 60 },
  { id: 'REPAIR', label: 'Repair', minutes: 90 },
  { id: 'OTHER', label: 'Other', minutes: 60 },
] as const

export type AppointmentKindId = (typeof APPOINTMENT_KINDS)[number]['id']
export type AppointmentStatusId = 'BOOKED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export const KIND_LABELS = Object.fromEntries(APPOINTMENT_KINDS.map((k) => [k.id, k.label])) as Record<AppointmentKindId, string>

export const STATUS_LABELS: Record<AppointmentStatusId, string> = {
  BOOKED: 'Booked',
  EN_ROUTE: 'On the way',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No one home',
}

/** Visits that still hold their slot on the calendar. */
export const LIVE_STATUSES: AppointmentStatusId[] = ['BOOKED', 'EN_ROUTE', 'IN_PROGRESS']

export function isLive(status: string): boolean {
  return (LIVE_STATUSES as string[]).includes(status)
}

export const DURATIONS = [30, 45, 60, 90, 120, 180, 240, 300, 360, 480]

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr${hours === 1 ? '' : 's'}` : `${hours} hr ${rest} min`
}

export type SlotResult =
  | { ok: true; startsAt: Date; endsAt: Date; ambiguous: boolean }
  | { ok: false; error: string }

/**
 * A booking's UTC range from the form. The end is the start plus the
 * length in real elapsed time, so a visit across a daylight-saving change
 * is still as long as it was booked for.
 */
export function slotFromForm(date: string, time: string, durationMinutes: number, timezone: string): SlotResult {
  const d = parseDateString(date)
  const t = parseTimeString(time)
  if (!d) return { ok: false, error: 'Pick a date.' }
  if (!t) return { ok: false, error: 'Pick a start time.' }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 12 * 60)
    return { ok: false, error: 'A visit is between 15 minutes and 12 hours.' }
  const start = zonedToUtc({ ...d, ...t }, timezone)
  if (!start.ok)
    return {
      ok: false,
      error:
        start.reason === 'gap'
          ? 'That time doesn’t exist on this date: the clocks go forward an hour. Pick a time after 3:00 am.'
          : 'That date and time isn’t valid.',
    }
  return { ok: true, startsAt: start.utc, endsAt: new Date(start.utc.getTime() + durationMinutes * 60_000), ambiguous: start.ambiguous }
}

/** Two ranges clash when they share any time. Back-to-back visits don't. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

const MOVES: Record<AppointmentStatusId, AppointmentStatusId[]> = {
  BOOKED: ['EN_ROUTE', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  EN_ROUTE: ['IN_PROGRESS', 'BOOKED', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ['BOOKED'],
}

export function canMove(from: string, to: string): boolean {
  return (MOVES[from as AppointmentStatusId] ?? []).includes(to as AppointmentStatusId)
}

/** What the technician does next, in the order they do it. */
export function nextAction(status: string): { to: AppointmentStatusId; label: string } | null {
  if (status === 'BOOKED') return { to: 'EN_ROUTE', label: 'On my way' }
  if (status === 'EN_ROUTE') return { to: 'IN_PROGRESS', label: 'Start job' }
  if (status === 'IN_PROGRESS') return { to: 'COMPLETED', label: 'Complete job' }
  return null
}

export interface HoursWindow {
  dayOfWeek: number
  startMinute: number
  endMinute: number
}

/**
 * Whether a visit sits inside the technician's stated working hours. With
 * no hours on file there's nothing to check against, so it passes.
 */
export function withinWorkingHours(startsAt: Date, endsAt: Date, timezone: string, hours: HoursWindow[]): boolean {
  if (hours.length === 0) return true
  const start = zonedParts(startsAt, timezone)
  const end = zonedParts(new Date(endsAt.getTime() - 1), timezone)
  if (start.weekday !== end.weekday) return false
  const from = start.hour * 60 + start.minute
  const to = end.hour * 60 + end.minute + 1
  return hours.some((w) => w.dayOfWeek === start.weekday && w.startMinute <= from && w.endMinute >= to)
}
