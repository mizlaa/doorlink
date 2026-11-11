import { AU_POSTCODE_PATTERN, type AuState } from './australia'

/**
 * Where a customer is, for showing local companies: an Australian
 * postcode, and the suburb when they've given one. Kept in a cookie so
 * the designer, the quote page and the measure request agree.
 */

export const LOCATION_COOKIE = 'doorlink-location'

export interface CustomerLocation {
  postcode: string
  suburb: string | null
  state: AuState | null
}

// Australia Post's allocation of postcode ranges to states and territories.
const RANGES: Array<[number, number, AuState]> = [
  [200, 299, 'ACT'],
  [800, 999, 'NT'],
  [1000, 2599, 'NSW'],
  [2600, 2618, 'ACT'],
  [2619, 2899, 'NSW'],
  [2900, 2920, 'ACT'],
  [2921, 2999, 'NSW'],
  [3000, 3999, 'VIC'],
  [4000, 4999, 'QLD'],
  [5000, 5999, 'SA'],
  [6000, 6999, 'WA'],
  [7000, 7999, 'TAS'],
  [8000, 8999, 'VIC'],
  [9000, 9999, 'QLD'],
]

export function stateForPostcode(postcode: string): AuState | null {
  if (!AU_POSTCODE_PATTERN.test(postcode)) return null
  const value = Number(postcode)
  return RANGES.find(([from, to]) => value >= from && value <= to)?.[2] ?? null
}

/** "Paddington" from " paddington  " — tidy, title-cased, letters and the usual punctuation only. */
export function tidySuburb(value: string): string | null {
  const cleaned = value
    .replace(/[^A-Za-z .'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  if (cleaned.length < 2) return null
  return cleaned.replace(/(^|[ -])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
}

/** Reads what the customer typed. Returns null when there's no valid Australian postcode in it. */
export function readLocation(input: { postcode?: unknown; suburb?: unknown }): CustomerLocation | null {
  const postcode = String(input.postcode ?? '').trim()
  const state = stateForPostcode(postcode)
  if (!state) return null
  return { postcode, suburb: tidySuburb(String(input.suburb ?? '')), state }
}

export function parseLocationCookie(value: string | undefined): CustomerLocation | null {
  if (!value) return null
  try {
    return readLocation(JSON.parse(decodeURIComponent(value)))
  } catch {
    return null
  }
}

export function locationCookieValue(location: CustomerLocation): string {
  return encodeURIComponent(JSON.stringify({ postcode: location.postcode, suburb: location.suburb }))
}

/** "Paddington, QLD" or "4064, QLD". */
export function locationLabel(location: CustomerLocation): string {
  return `${location.suburb ?? location.postcode}${location.state ? `, ${location.state}` : ''}`
}
