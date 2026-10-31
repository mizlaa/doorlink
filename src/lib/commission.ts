/**
 * Doorlink's marketplace commission.
 *
 * The rate is stored in PlatformSetting, not in code, because the brief
 * is explicit that an admin must be able to change it without a
 * rebuild. It is expressed in basis points (1/100th of a percent) so a
 * rate like 12.5% is an exact integer (1250) rather than a float that
 * has to be trusted to round the same way twice.
 *
 * This module is deliberately pure — no database, no environment, no
 * imports at all — because the quoting UI is a client component and has
 * to be able to show a technician their split before they submit.
 * Reading the configured rate lives in commission-settings.ts, which the
 * server imports and the browser never sees.
 */
export const COMMISSION_SETTING_KEY = 'marketplace_commission_bps'

/**
 * 5% of the job price, until an admin sets something else. Lower than
 * general-task marketplaces (Airtasker takes 12.5–20% from Taskers)
 * because door and gate work is materials-heavy: installers typically
 * net 10–20%, and businesses here already pay a subscription.
 */
export const DEFAULT_COMMISSION_BPS = 500

/**
 * Businesses that pay no commission — the platform owner's own company.
 * A list of business keys ("o_<org id>" / "u_<user id>").
 */
export const COMMISSION_EXEMPT_SETTING_KEY = 'commission_exempt_businesses'

export const MAX_COMMISSION_BPS = 5000

export interface CommissionSplit {
  grossCents: number
  commissionRateBps: number
  commissionCents: number
  workerPayoutCents: number
}

/**
 * Splits a gross amount into Doorlink's commission and the worker's
 * payout.
 *
 * The worker's payout is computed as the remainder rather than
 * independently rounded, so commission + payout always equals gross
 * exactly. Rounding both halves separately is how marketplaces end up a
 * cent short and cannot reconcile.
 */
export function calculateSplit(grossCents: number, commissionRateBps: number): CommissionSplit {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error('grossCents must be a non-negative integer of minor units')
  }
  if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > MAX_COMMISSION_BPS) {
    throw new Error(`commissionRateBps must be an integer between 0 and ${MAX_COMMISSION_BPS}`)
  }

  const commissionCents = Math.round((grossCents * commissionRateBps) / 10_000)
  return {
    grossCents,
    commissionRateBps,
    commissionCents,
    workerPayoutCents: grossCents - commissionCents,
  }
}

/**
 * Basis points as a percentage, with no trailing zeros: 1000 -> "10%",
 * 1250 -> "12.5%", 1255 -> "12.55%". Showing "12.50%" next to "10%" in
 * the same list reads as two different kinds of number.
 */
export function formatCommissionRate(bps: number): string {
  const percent = (bps / 100).toFixed(2).replace(/\.?0+$/, '')
  return `${percent}%`
}

/**
 * The split for a marketplace payment whose commission is worked on part
 * of it — the price before GST, since GST is the tax office's money, not
 * the business's revenue. On a $3,300 job ($3,000 + GST) at 5%, Doorlink's
 * fee is $150 and $3,150 goes to the business's side, before its card
 * processing fees.
 */
export function calculateBasedSplit(grossCents: number, baseCents: number, commissionRateBps: number): CommissionSplit {
  if (!Number.isInteger(baseCents) || baseCents < 0 || baseCents > grossCents) {
    throw new Error('baseCents must be whole cents between 0 and the gross')
  }
  const base = calculateSplit(baseCents, commissionRateBps)
  return {
    grossCents,
    commissionRateBps,
    commissionCents: base.commissionCents,
    workerPayoutCents: grossCents - base.commissionCents,
  }
}

/** The share of a commission base that belongs to one part payment (a deposit or a balance). */
export function proportionalBase(totalBaseCents: number, totalGrossCents: number, partGrossCents: number): number {
  if (totalGrossCents <= 0) return 0
  return Math.min(partGrossCents, Math.round((totalBaseCents * partGrossCents) / totalGrossCents))
}
