import { describe, expect, it } from 'vitest'
import { addDays, dayRange, localDateString, localTimeString, offsetMinutes, startOfWeek, zonedToUtc, zoneAbbreviation } from './timezone'

const SYDNEY = 'Australia/Sydney'
const BRISBANE = 'Australia/Brisbane'
const at = (year: number, month: number, day: number, hour: number, minute = 0) => ({ year, month, day, hour, minute })

describe('zonedToUtc in Sydney', () => {
  it('converts an ordinary winter and summer time', () => {
    // July: AEST, UTC+10. January: AEDT, UTC+11.
    expect(zonedToUtc(at(2026, 7, 15, 9, 30), SYDNEY)).toEqual({ ok: true, utc: new Date('2026-07-14T23:30:00Z'), ambiguous: false })
    expect(zonedToUtc(at(2027, 1, 15, 9, 30), SYDNEY)).toEqual({ ok: true, utc: new Date('2027-01-14T22:30:00Z'), ambiguous: false })
  })

  it('refuses a time skipped when daylight saving starts (4 October 2026, 2:00 → 3:00)', () => {
    expect(zonedToUtc(at(2026, 10, 4, 2, 30), SYDNEY)).toEqual({ ok: false, reason: 'gap' })
    // The minute before and the first minute after both exist.
    expect(zonedToUtc(at(2026, 10, 4, 1, 59), SYDNEY)).toMatchObject({ ok: true, utc: new Date('2026-10-03T15:59:00Z') })
    expect(zonedToUtc(at(2026, 10, 4, 3, 0), SYDNEY)).toMatchObject({ ok: true, utc: new Date('2026-10-03T16:00:00Z') })
  })

  it('resolves a time that happens twice when daylight saving ends (4 April 2027, 3:00 → 2:00) to the first', () => {
    const result = zonedToUtc(at(2027, 4, 4, 2, 30), SYDNEY)
    // The first 2:30 is still daylight time (UTC+11).
    expect(result).toEqual({ ok: true, utc: new Date('2027-04-03T15:30:00Z'), ambiguous: true })
  })

  it('keeps a booking the right length across the change', () => {
    // 1:30 am for two hours on the night clocks go forward ends at 4:30 am on the clock.
    const start = zonedToUtc(at(2026, 10, 4, 1, 30), SYDNEY)
    if (!start.ok) throw new Error('expected a time')
    const end = new Date(start.utc.getTime() + 120 * 60_000)
    expect(localTimeString(end, SYDNEY)).toBe('04:30')
    // And two hours on the night they go back ends an hour "earlier" on the clock.
    const autumn = zonedToUtc(at(2027, 4, 4, 1, 30), SYDNEY)
    if (!autumn.ok) throw new Error('expected a time')
    expect(localTimeString(new Date(autumn.utc.getTime() + 120 * 60_000), SYDNEY)).toBe('02:30')
  })

  it('rejects dates and times that do not exist', () => {
    expect(zonedToUtc(at(2026, 2, 30, 9), SYDNEY)).toEqual({ ok: false, reason: 'invalid' })
    expect(zonedToUtc(at(2026, 5, 1, 24), SYDNEY)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('days and offsets', () => {
  it('knows the offset either side of the change', () => {
    expect(offsetMinutes(new Date('2026-10-03T15:59:00Z'), SYDNEY)).toBe(600)
    expect(offsetMinutes(new Date('2026-10-03T16:00:00Z'), SYDNEY)).toBe(660)
    expect(zoneAbbreviation(new Date('2026-07-01T00:00:00Z'), SYDNEY)).toBe('AEST')
    expect(zoneAbbreviation(new Date('2027-01-01T00:00:00Z'), SYDNEY)).toBe('AEDT')
    // Queensland has no daylight saving.
    expect(offsetMinutes(new Date('2027-01-01T00:00:00Z'), BRISBANE)).toBe(600)
  })

  it('gives a 23-hour day when clocks go forward and a 25-hour day when they go back', () => {
    const spring = dayRange('2026-10-04', SYDNEY)!
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23)
    const autumn = dayRange('2027-04-04', SYDNEY)!
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25)
    const ordinary = dayRange('2026-08-12', SYDNEY)!
    expect((ordinary.end.getTime() - ordinary.start.getTime()) / 3_600_000).toBe(24)
  })

  it('puts a late-evening UTC instant on the right local day', () => {
    expect(localDateString(new Date('2026-10-03T16:00:00Z'), SYDNEY)).toBe('2026-10-04')
    expect(localDateString(new Date('2026-10-03T13:00:00Z'), SYDNEY)).toBe('2026-10-03')
  })

  it('does calendar arithmetic without a zone', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2026-10-04', 1)).toBe('2026-10-05')
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28')
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28')
  })
})
