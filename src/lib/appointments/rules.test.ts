import { describe, expect, it } from 'vitest'
import { canMove, nextAction, rangesOverlap, slotFromForm, withinWorkingHours } from './rules'

const SYDNEY = 'Australia/Sydney'

describe('slotFromForm', () => {
  it('books in the business zone and stores UTC', () => {
    const slot = slotFromForm('2026-11-16', '09:30', 90, SYDNEY)
    expect(slot).toMatchObject({ ok: true, startsAt: new Date('2026-11-15T22:30:00Z'), endsAt: new Date('2026-11-16T00:00:00Z') })
  })

  it('refuses the hour that is skipped when Sydney clocks go forward', () => {
    const slot = slotFromForm('2026-10-04', '02:15', 60, SYDNEY)
    expect(slot.ok).toBe(false)
    if (!slot.ok) expect(slot.error).toMatch(/clocks go forward/)
  })

  it('keeps the booked length across the autumn change', () => {
    // 1:00 am for three hours on 4 April 2027: three real hours, ending 3:00 am on the clock (after the repeated hour).
    const slot = slotFromForm('2027-04-04', '01:00', 180, SYDNEY)
    if (!slot.ok) throw new Error(slot.error)
    expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(180 * 60_000)
    expect(slot.endsAt).toEqual(new Date('2027-04-03T17:00:00Z'))
  })

  it('flags a time that happens twice', () => {
    const slot = slotFromForm('2027-04-04', '02:30', 60, SYDNEY)
    expect(slot).toMatchObject({ ok: true, ambiguous: true })
  })

  it('rejects bad input', () => {
    expect(slotFromForm('2026-02-31', '09:00', 60, SYDNEY).ok).toBe(false)
    expect(slotFromForm('2026-03-01', '25:00', 60, SYDNEY).ok).toBe(false)
    expect(slotFromForm('2026-03-01', '09:00', 5, SYDNEY).ok).toBe(false)
  })
})

describe('rangesOverlap', () => {
  const t = (iso: string) => new Date(iso)
  it('treats back-to-back visits as clear', () => {
    expect(rangesOverlap(t('2026-11-16T00:00Z'), t('2026-11-16T01:00Z'), t('2026-11-16T01:00Z'), t('2026-11-16T02:00Z'))).toBe(false)
  })
  it('catches partial and containing overlaps', () => {
    expect(rangesOverlap(t('2026-11-16T00:00Z'), t('2026-11-16T01:00Z'), t('2026-11-16T00:59Z'), t('2026-11-16T02:00Z'))).toBe(true)
    expect(rangesOverlap(t('2026-11-16T00:00Z'), t('2026-11-16T04:00Z'), t('2026-11-16T01:00Z'), t('2026-11-16T02:00Z'))).toBe(true)
  })
})

describe('status moves', () => {
  it('walks a visit forward', () => {
    expect(nextAction('BOOKED')?.to).toBe('EN_ROUTE')
    expect(nextAction('EN_ROUTE')?.to).toBe('IN_PROGRESS')
    expect(nextAction('IN_PROGRESS')?.to).toBe('COMPLETED')
    expect(nextAction('COMPLETED')).toBeNull()
  })
  it('never reopens a finished or cancelled visit', () => {
    expect(canMove('COMPLETED', 'BOOKED')).toBe(false)
    expect(canMove('CANCELLED', 'BOOKED')).toBe(false)
    expect(canMove('BOOKED', 'COMPLETED')).toBe(false)
  })
})

describe('withinWorkingHours', () => {
  const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute: 7 * 60, endMinute: 17 * 60 }))
  it('passes inside hours and fails outside, in local time', () => {
    // Monday 16 Nov 2026, 9:30–11:00 Sydney.
    expect(withinWorkingHours(new Date('2026-11-15T22:30:00Z'), new Date('2026-11-16T00:00:00Z'), SYDNEY, weekdays)).toBe(true)
    // Monday 6:00–7:30 starts too early.
    expect(withinWorkingHours(new Date('2026-11-15T19:00:00Z'), new Date('2026-11-15T20:30:00Z'), SYDNEY, weekdays)).toBe(false)
    // Sunday.
    expect(withinWorkingHours(new Date('2026-11-14T22:30:00Z'), new Date('2026-11-15T00:00:00Z'), SYDNEY, weekdays)).toBe(false)
  })
  it('has nothing to check when no hours are set', () => {
    expect(withinWorkingHours(new Date('2026-11-14T22:30:00Z'), new Date('2026-11-15T00:00:00Z'), SYDNEY, [])).toBe(true)
  })
})
