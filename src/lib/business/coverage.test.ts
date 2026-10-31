import { describe, expect, it } from 'vitest'
import { formatRange, parsePostcodeRanges, travelFeeFor } from './coverage'

describe('travelFeeFor', () => {
  const areas = [
    { fromPostcode: '2000', toPostcode: '2234', travelFeeCents: 0 },
    { fromPostcode: '2200', toPostcode: '2300', travelFeeCents: 5000 },
    { fromPostcode: '2750', toPostcode: '2750', travelFeeCents: 8000 },
  ]

  it('serves the ends of a range and charges the lowest fee where ranges overlap', () => {
    expect(travelFeeFor(areas, '2000')).toBe(0)
    expect(travelFeeFor(areas, '2234')).toBe(0)
    expect(travelFeeFor(areas, '2250')).toBe(5000)
    expect(travelFeeFor(areas, '2750')).toBe(8000)
  })

  it('does not serve postcodes outside every range, or invalid ones', () => {
    expect(travelFeeFor(areas, '2301')).toBeNull()
    expect(travelFeeFor(areas, '3000')).toBeNull()
    expect(travelFeeFor(areas, '20')).toBeNull()
    expect(travelFeeFor([], '2000')).toBeNull()
  })
})

describe('parsePostcodeRanges', () => {
  it('reads ranges, single postcodes and en dashes', () => {
    expect(parsePostcodeRanges('2000-2234, 2750; 2560 – 2580')).toEqual({
      ok: true,
      areas: [
        { fromPostcode: '2000', toPostcode: '2234' },
        { fromPostcode: '2750', toPostcode: '2750' },
        { fromPostcode: '2560', toPostcode: '2580' },
      ],
    })
  })

  it('refuses backwards, malformed and empty input', () => {
    expect(parsePostcodeRanges('2234-2000').ok).toBe(false)
    expect(parsePostcodeRanges('Sydney').ok).toBe(false)
    expect(parsePostcodeRanges(' , ').ok).toBe(false)
  })

  it('formats ranges', () => {
    expect(formatRange({ fromPostcode: '2000', toPostcode: '2000' })).toBe('2000')
    expect(formatRange({ fromPostcode: '2000', toPostcode: '2234' })).toBe('2000–2234')
  })
})
