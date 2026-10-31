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
/** FIXED stands as quoted; ESTIMATE is confirmed by the business, after a site inspection if needed. */
export type PriceTypeId = 'FIXED' | 'ESTIMATE'

/** Australian GST: 10%. */
export const GST_RATE = 0.1

export interface RuleTerms {
  id: string
  product: PricedProductId
  productStyle: string | null
  productBrand: string | null
  productModel?: string | null
  /** Gates and fences; null for any material. */
  material?: string | null
  priceType?: PriceTypeId
  motorIncluded: boolean
  /** The included motor's brand, or, with an add-on price, the brand of motor added. */
  motorBrand: string | null
  /** Without an included motor: what adding one costs, when the business offers it. */
  motorAddOnCents?: number | null
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
  /** Gates and fences: the chosen material. */
  material?: string | null
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

/** One priced line of a quote, as the business configured it. */
export interface QuoteLine {
  kind: 'base' | 'installation' | 'motor' | 'accessory' | 'travel'
  label: string
  amountCents: number
  gst: GstTreatmentId
}

export interface QuoteOptionDraft extends PriceBreakdown {
  ruleId: string
  productBrand: string | null
  productModel: string | null
  priceType: PriceTypeId
  lines: QuoteLine[]
  /** Set when the motor is priced as an add-on rather than included. */
  motorAddOnCents: number | null
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

/**
 * Totals for lines that may mix GST treatments: inclusive and exclusive
 * amounts are each broken down once, then added, so a quote's GST is the
 * same however its lines are ordered.
 */
export function totalsForLines(lines: Array<Pick<QuoteLine, 'amountCents' | 'gst'>>): PriceBreakdown {
  const sum = (gst: GstTreatmentId) =>
    lines.filter((line) => line.gst === gst).reduce((total, line) => total + line.amountCents, 0)
  const inclusive = gstBreakdown(sum('INCLUSIVE'), 'INCLUSIVE')
  const exclusive = gstBreakdown(sum('EXCLUSIVE'), 'EXCLUSIVE')
  return {
    subtotalExGstCents: inclusive.subtotalExGstCents + exclusive.subtotalExGstCents,
    gstCents: inclusive.gstCents + exclusive.gstCents,
    totalIncGstCents: inclusive.totalIncGstCents + exclusive.totalIncGstCents,
  }
}

function hasMotorAddOn(rule: RuleTerms): boolean {
  return !rule.motorIncluded && rule.motorAddOnCents !== null && rule.motorAddOnCents !== undefined
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

  // A rule for one material covers only that material; no material, all.
  if (rule.material && rule.material !== (request.material ?? null)) return false

  // A motorised price is not a price for a manual gate. A manual price
  // covers a motorised request only when the business priced the motor
  // as an add-on; otherwise it says nothing about the motor.
  if (request.motorRequired) {
    if (!rule.motorIncluded && !hasMotorAddOn(rule)) return false
  } else if (rule.motorIncluded) {
    return false
  }
  if (request.motorRequired) {
    const wantedMotor = normaliseBrand(request.motorBrand)
    if (wantedMotor && normaliseBrand(rule.motorBrand) !== wantedMotor) return false
  }

  return request.installRequired ? servesInstall(rule.installation) : servesSupplyOnly(rule.installation)
}

export function optionFromRule(
  rule: RuleTerms,
  installRequired: boolean,
  motorRequired = rule.motorIncluded
): QuoteOptionDraft {
  const addInstall = installRequired && rule.installation === 'SEPARATE'
  if (addInstall && (rule.installPriceCents === null || rule.installPriceCents === undefined)) {
    throw new Error(`rule ${rule.id} offers separate installation without a price`)
  }
  const installPriceCents = addInstall ? (rule.installPriceCents as number) : null
  const motorAddOnCents = motorRequired && hasMotorAddOn(rule) ? (rule.motorAddOnCents as number) : null
  const lines: QuoteLine[] = [{ kind: 'base', label: 'Product', amountCents: rule.priceCents, gst: rule.gst }]
  if (installPriceCents !== null)
    lines.push({ kind: 'installation', label: 'Installation', amountCents: installPriceCents, gst: rule.gst })
  if (motorAddOnCents !== null)
    lines.push({ kind: 'motor', label: 'Motor', amountCents: motorAddOnCents, gst: rule.gst })
  return {
    ruleId: rule.id,
    productBrand: rule.productBrand,
    productModel: rule.productModel ?? null,
    priceType: rule.priceType ?? 'FIXED',
    lines,
    motorAddOnCents,
    motorIncluded: rule.motorIncluded || motorAddOnCents !== null,
    motorBrand: rule.motorIncluded || motorAddOnCents !== null ? rule.motorBrand : null,
    installation: rule.installation,
    gst: rule.gst,
    priceCents: rule.priceCents,
    installPriceCents,
    currency: rule.currency,
    note: rule.note,
    ...totalsForLines(lines),
  }
}

/**
 * Adds the business-level extras to an option: accessories the customer
 * chose that the business prices, and any travel fee for the postcode.
 */
export function withExtras(option: QuoteOptionDraft, extras: QuoteLine[]): QuoteOptionDraft {
  if (extras.length === 0) return option
  const lines = [...option.lines, ...extras]
  return { ...option, lines, ...totalsForLines(lines) }
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
    .map((rule) => optionFromRule(rule, request.installRequired, request.motorRequired))
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
  if (normaliseBrand(a.productModel) !== normaliseBrand(b.productModel)) return false
  if (a.material && b.material && a.material !== b.material) return false
  // Two rules clash on motor terms when both price a manual product, or
  // both price a motorised one (included or as an add-on) with the same
  // motor brand.
  const bothManual = !a.motorIncluded && !b.motorIncluded
  const aMotor = a.motorIncluded || hasMotorAddOn(a)
  const bMotor = b.motorIncluded || hasMotorAddOn(b)
  const bothMotorSameBrand = aMotor && bMotor && normaliseBrand(a.motorBrand) === normaliseBrand(b.motorBrand)
  if (!bothManual && !bothMotorSameBrand) return false
  const sameService =
    (servesInstall(a.installation) && servesInstall(b.installation)) ||
    (servesSupplyOnly(a.installation) && servesSupplyOnly(b.installation))
  if (!sameService) return false
  return (
    rangesOverlap(a.minWidthMm, a.maxWidthMm, b.minWidthMm, b.maxWidthMm) &&
    rangesOverlap(a.minHeightMm, a.maxHeightMm, b.minHeightMm, b.maxHeightMm)
  )
}
