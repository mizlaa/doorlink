/**
 * What the Compliance & Safety Pack costs.
 *
 * Pure, so the client can format a price without pulling Prisma into the
 * bundle. The value itself comes from `PlatformSetting` — see
 * `pricing-settings.ts` — for the same reason the commission rate does:
 * the brief is explicit that prices must not be permanently hard-coded,
 * and an admin has to be able to change one without a rebuild.
 *
 * $29.99 AUD is the launch price, expressed here as the default rather
 * than as a constant the rest of the app reads directly.
 */

export const COMPLIANCE_PRICE_SETTING_KEY = 'compliance_pack_price_cents'

/** $29.99 AUD in integer minor units. */
export const DEFAULT_COMPLIANCE_PRICE_CENTS = 2999

export const COMPLIANCE_CURRENCY = 'AUD'

/**
 * A ceiling, so a mistyped admin value cannot put a four-figure price on
 * a document pack. Deliberately generous rather than tight.
 */
export const MAX_COMPLIANCE_PRICE_CENTS = 100_000

export function isValidPriceCents(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COMPLIANCE_PRICE_CENTS
  )
}

/**
 * A reference for a purchase. Readable in a provider dashboard and
 * unique per attempt, so a retried purchase never collides with the one
 * before it.
 */
export function purchaseReference(now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/\D/g, '') // digits only: drops - : T . Z
    .slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `CSP-${stamp}-${suffix}`
}
