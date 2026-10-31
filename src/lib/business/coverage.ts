/**
 * Where a business works: inclusive postcode ranges, each with an optional
 * travel fee. Pure functions, so the rules are tested directly.
 *
 * A business with no ranges has not said where it works, so it is not
 * offered to anyone yet — "can service the customer's location" is never
 * assumed.
 */

export interface ServiceAreaTerms {
  fromPostcode: string
  toPostcode: string
  travelFeeCents: number
}

const POSTCODE = /^\d{4}$/

/**
 * The travel fee for a postcode, or null when the business does not serve
 * it. Where ranges overlap the lowest fee applies, so a customer is never
 * charged more because of how the ranges were typed.
 */
export function travelFeeFor(areas: ServiceAreaTerms[], postcode: string): number | null {
  if (!POSTCODE.test(postcode)) return null
  const value = Number(postcode)
  let best: number | null = null
  for (const area of areas) {
    if (value >= Number(area.fromPostcode) && value <= Number(area.toPostcode)) {
      best = best === null ? area.travelFeeCents : Math.min(best, area.travelFeeCents)
    }
  }
  return best
}

export type CoverageParse =
  | { ok: true; areas: Array<{ fromPostcode: string; toPostcode: string }> }
  | { ok: false; error: string }

/**
 * Reads "2000-2234, 2750, 2560–2580" into ranges. Single postcodes become
 * one-postcode ranges; en dashes and spaces are accepted.
 */
export function parsePostcodeRanges(text: string): CoverageParse {
  const parts = text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return { ok: false, error: 'Enter at least one postcode or range.' }
  if (parts.length > 200) return { ok: false, error: 'That is too many ranges. Combine them into fewer.' }
  const areas: Array<{ fromPostcode: string; toPostcode: string }> = []
  for (const part of parts) {
    const match = /^(\d{4})(?:\s*[-–]\s*(\d{4}))?$/.exec(part)
    if (!match) return { ok: false, error: `“${part}” isn’t a postcode or range, like 2000-2234.` }
    const from = match[1]
    const to = match[2] ?? match[1]
    if (Number(from) > Number(to)) return { ok: false, error: `${from}-${to} runs backwards.` }
    areas.push({ fromPostcode: from, toPostcode: to })
  }
  return { ok: true, areas }
}

export function formatRange(area: { fromPostcode: string; toPostcode: string }): string {
  return area.fromPostcode === area.toPostcode ? area.fromPostcode : `${area.fromPostcode}–${area.toPostcode}`
}
