import { describe, expect, it } from 'vitest'
import { hourRange, monthGrid, placeDay, shiftDate, weekDays } from './calendar'

const SYDNEY = 'Australia/Sydney'
const visit = (id: string, start: string, end: string) => ({ id, startsAt: new Date(start), endsAt: new Date(end) })

describe('placeDay', () => {
  it('puts a visit on its local day, not its UTC day', () => {
    // 8:00–9:00 am Monday 16 Nov in Sydney is Sunday evening in UTC.
    const items = [visit('a', '2026-11-15T21:00:00Z', '2026-11-15T22:00:00Z')]
    expect(placeDay(items, '2026-11-16', SYDNEY)).toMatchObject([{ startMinute: 480, endMinute: 540, column: 0, columns: 1 }])
    expect(placeDay(items, '2026-11-15', SYDNEY)).toEqual([])
  })

  it('shares the width between overlapping visits and gives it back afterwards', () => {
    const items = [
      visit('a', '2026-11-15T21:00:00Z', '2026-11-15T23:00:00Z'), // 8–10
      visit('b', '2026-11-15T22:00:00Z', '2026-11-16T00:00:00Z'), // 9–11
      visit('c', '2026-11-16T02:00:00Z', '2026-11-16T03:00:00Z'), // 1–2 pm
    ]
    const placed = placeDay(items, '2026-11-16', SYDNEY)
    expect(placed.map((p) => [p.item.id, p.column, p.columns])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ])
  })

  it('reuses a lane once it is free', () => {
    const items = [
      visit('a', '2026-11-15T21:00:00Z', '2026-11-15T22:00:00Z'), // 8–9
      visit('b', '2026-11-15T21:30:00Z', '2026-11-15T23:00:00Z'), // 8:30–10
      visit('c', '2026-11-15T22:00:00Z', '2026-11-15T22:30:00Z'), // 9–9:30, back in lane 0
    ]
    expect(placeDay(items, '2026-11-16', SYDNEY).map((p) => p.column)).toEqual([0, 1, 0])
  })

  it('places a visit correctly on the day the clocks go forward', () => {
    // 9:00 am on 4 Oct 2026 in Sydney is UTC+11: 22:00 UTC the day before.
    const placed = placeDay([visit('a', '2026-10-03T22:00:00Z', '2026-10-03T23:00:00Z')], '2026-10-04', SYDNEY)
    expect(placed[0]).toMatchObject({ startMinute: 540, endMinute: 600 })
  })
})

describe('grids', () => {
  it('shows working hours and stretches for early or late visits', () => {
    expect(hourRange([])).toEqual({ from: 7, to: 18 })
    expect(hourRange([{ startMinute: 330, endMinute: 400 }, { startMinute: 1100, endMinute: 1210 }])).toEqual({ from: 5, to: 21 })
  })
  it('starts weeks on Monday', () => {
    expect(weekDays('2026-11-11')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
  })
  it('builds a six-week month', () => {
    const grid = monthGrid('2026-11-11')
    expect(grid.days[0]).toBe('2026-10-26')
    expect(grid.days).toHaveLength(42)
    expect(grid.days).toContain('2026-11-30')
  })
  it('pages by view', () => {
    expect(shiftDate('2026-11-11', 'day', 1)).toBe('2026-11-12')
    expect(shiftDate('2026-11-11', 'week', -1)).toBe('2026-11-04')
    expect(shiftDate('2026-01-31', 'month', 1)).toBe('2026-02-01')
    expect(shiftDate('2026-01-15', 'month', -1)).toBe('2025-12-01')
  })
})
