/**
 * Automated pricing: which of a business's rules cover a customer's
 * design, and what the price comes to.
 *
 * Pure functions with no database access, so every rule about matching,
 * boundaries and GST is tested directly. Two principles run through it:
 *
 *  - A price is only ever a business's own configured figure. Nothing
 *    here estimates, interpolates or borrows a price from a neighbouring
 *    range; when no rule covers a design the answer is "no automated
 *    price", never a guess.
 *  - Ranges are inclusive at both ends. 2300–2500 covers 2500, so a rule
 *    starting at 2500 overlaps it — and overlapping rules are refused when
 *    saved, so a design can never match two conflicting prices.
 */

export type PricedProductId =
  | 'GARAGE_DOOR'
  | 'SLIDING_GATE'
  | 'SWING_GATE'
  | 'PEDESTRIAN_GATE'
  | 'FENCE'
  | 'WINDOW_SHUTTER'
  | 'SHOP_SHUTTER'

export type GstTreatmentId = 'INCLUSIVE' | 'EXCLUSIVE'
export type InstallationTermsId = 'INCLUDED' | 'SEPARATE' | 'NOT_INCLUDED'

/** Australian GST: 10%. */
export const GST_RATE = 0.1

export interface RuleTerms {
  id: string
  product: PricedProductId
  productStyle: string | null
  productBrand: string | null
  motorIncluded: boolean
  motorBrand: string | null
  installation: InstallationTermsId
  installPriceCents: number | null
  minWidthMm: number
  maxWidthMm: number
  minHeightMm: number
  maxHeightMm: number
  priceCents: number
  gst: GstTreatmentId
  currency: string
  note: string | null
  active: boolean
}

export interface QuoteRequest {
  product: PricedProductId
  /** Garage doors: sectional / roller / tilt. */
  productStyle: string | null
  widthMm: number
  heightMm: number
  /** Null when the customer has no brand preference. */
  brand: string | null
  motorRequired: boolean
  /** Null when any motor brand will do. */
  motorBrand: string | null
  installRequired: boolean
}

export interface PriceBreakdown {
  subtotalExGstCents: number
  gstCents: number
  totalIncGstCents: number
}

export interface QuoteOptionDraft extends PriceBreakdown {
  ruleId: string
  productBrand: string | null
  motorIncluded: boolean
  motorBrand: string | null
  installation: InstallationTermsId
  gst: GstTreatmentId
  priceCents: number
  /** Present only when separately priced installation was added. */
  installPriceCents: number | null
  currency: string
  note: string | null
}

export type UnavailableReason = 'not-offered' | 'size' | 'configuration'

export type MatchResult =
  | { available: true; options: QuoteOptionDraft[] }
  | { available: false; reason: UnavailableReason }

/** Brand names compared the way a person would: case and spacing ignored. */
export function normaliseBrand(brand: string | null | undefined): string | null {
  const value = (brand ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return value === '' ? null : value
}

/**
 * GST on a configured amount. INCLUSIVE prices already contain GST, which
 * is one eleventh of the total; EXCLUSIVE prices have 10% added. Cents
 * are rounded half up, once, on the GST component.
 */
export function gstBreakdown(amountCents: number, gst: GstTreatmentId): PriceBreakdown {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error('amount must be whole cents')
  if (gst === 'INCLUSIVE') {
    const gstCents = Math.round(amountCents / 11)
    return { subtotalExGstCents: amountCents - gstCents, gstCents, totalIncGstCents: amountCents }
  }
  const gstCents = Math.round(amountCents * GST_RATE)
  return { subtotalExGstCents: amountCents, gstCents, totalIncGstCents: amountCents + gstCents }
}

function servesInstall(terms: InstallationTermsId): boolean {
  return terms === 'INCLUDED' || terms === 'SEPARATE'
}

function servesSupplyOnly(terms: InstallationTermsId): boolean {
  return terms === 'NOT_INCLUDED' || terms === 'SEPARATE'
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

function coversSize(rule: RuleTerms, request: QuoteRequest): boolean {
  return (
    inRange(request.widthMm, rule.minWidthMm, rule.maxWidthMm) &&
    inRange(request.heightMm, rule.minHeightMm, rule.maxHeightMm)
  )
}

function coversConfiguration(rule: RuleTerms, request: QuoteRequest): boolean {
  // A rule for all garage door styles covers every style; a styled rule
  // covers only its own.
  if (rule.productStyle && rule.productStyle !== request.productStyle) return false

  // A customer who asked for a brand gets that brand only. With no
  // preference, every brand (and an unnamed one) is an option.
  const wantedBrand = normaliseBrand(request.brand)
  if (wantedBrand && normaliseBrand(rule.productBrand) !== wantedBrand) return false

  // Motor inclusion must match exactly: a motorised price is not a price
  // for a manual gate, and a manual price says nothing about the motor.
  if (rule.motorIncluded !== request.motorRequired) return false
  if (request.motorRequired) {
    const wantedMotor = normaliseBrand(request.motorBrand)
    if (wantedMotor && normaliseBrand(rule.motorBrand) !== wantedMotor) return false
  }

  return request.installRequired ? servesInstall(rule.installation) : servesSupplyOnly(rule.installation)
}

export function optionFromRule(rule: RuleTerms, installRequired: boolean): QuoteOptionDraft {
  const addInstall = installRequired && rule.installation === 'SEPARATE'
  if (addInstall && (rule.installPriceCents === null || rule.installPriceCents === undefined)) {
    throw new Error(`rule ${rule.id} offers separate installation without a price`)
  }
  const installPriceCents = addInstall ? (rule.installPriceCents as number) : null
  return {
    ruleId: rule.id,
    productBrand: rule.productBrand,
    motorIncluded: rule.motorIncluded,
    motorBrand: rule.motorIncluded ? rule.motorBrand : null,
    installation: rule.installation,
    gst: rule.gst,
    priceCents: rule.priceCents,
    installPriceCents,
    currency: rule.currency,
    note: rule.note,
    ...gstBreakdown(rule.priceCents + (installPriceCents ?? 0), rule.gst),
  }
}

/**
 * Every option one business can quote for a request, cheapest first, or
 * the reason it cannot quote at all. The reason is deliberately coarse:
 * it tells the customer what kind of mismatch it is without revealing the
 * business's ranges.
 */
export function matchRules(request: QuoteRequest, rules: RuleTerms[]): MatchResult {
  const forProduct = rules.filter((rule) => rule.active && rule.product === request.product)
  if (forProduct.length === 0) return { available: false, reason: 'not-offered' }

  const sized = forProduct.filter((rule) => coversSize(rule, request))
  if (sized.length === 0) return { available: false, reason: 'size' }

  const matching = sized.filter((rule) => coversConfiguration(rule, request))
  if (matching.length === 0) return { available: false, reason: 'configuration' }

  const options = matching
    .map((rule) => optionFromRule(rule, request.installRequired))
    .sort((a, b) => a.totalIncGstCents - b.totalIncGstCents || a.ruleId.localeCompare(b.ruleId))
  return { available: true, options }
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin <= bMax && bMin <= aMax
}

/**
 * Whether two rules could both price the same request for the same
 * terms — which would leave the customer with two prices for one thing.
 * Rules that differ in brand, motor or motor brand are different
 * products and may sit side by side; they become separate options.
 */
export function rulesConflict(a: RuleTerms, b: RuleTerms): boolean {
  if (a.id === b.id || !a.active || !b.active) return false
  if (a.product !== b.product) return false
  if (a.productStyle && b.productStyle && a.productStyle !== b.productStyle) return false
  if (normaliseBrand(a.productBrand) !== normaliseBrand(b.productBrand)) return false
  if (a.motorIncluded !== b.motorIncluded) return false
  if (a.motorIncluded && normaliseBrand(a.motorBrand) !== normaliseBrand(b.motorBrand)) return false
  const sameService =
    (servesInstall(a.installation) && servesInstall(b.installation)) ||
    (servesSupplyOnly(a.installation) && servesSupplyOnly(b.installation))
  if (!sameService) return false
  return (
    rangesOverlap(a.minWidthMm, a.maxWidthMm, b.minWidthMm, b.maxWidthMm) &&
    rangesOverlap(a.minHeightMm, a.maxHeightMm, b.minHeightMm, b.maxHeightMm)
  )
}
