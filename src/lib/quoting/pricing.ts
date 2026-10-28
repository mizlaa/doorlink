/**
 * Automated quote maths and rule checks. Pure functions only: no database,
 * no session. Money is integer cents throughout.
 *
 * Rules a business sets:
 *  - width and height ranges are inclusive at both ends (2,300–2,500 covers 2,300 and 2,500)
 *  - two active rules for the same product, brand and motor arrangement may not overlap
 *    in both width and height, so any size maps to at most one price
 *  - GST is 10%. INCLUSIVE prices already contain it (GST = price ÷ 11); EXCLUSIVE prices
 *    have it added. GST is rounded to the nearest cent, halves rounded up.
 */
import type { GstTreatment, InstallationMode, MotorChoice, QuoteProductCategory } from '@prisma/client'
import { brandKey, categoryInfo, CATEGORY_IDS, listedMotorBrand } from './catalogue'

export const GST_RATE_PERCENT = 10
/** Generous sanity bounds for any measurement, in millimetres. Not a product limit. */
export const MEASUREMENT_LIMITS = { min: 100, max: 50000 } as const
export const MAX_PRICE_CENTS = 100_000_000 // $1,000,000

export interface RuleInput {
  category: QuoteProductCategory
  brand: string | null
  widthMinMm: number
  widthMaxMm: number
  heightMinMm: number
  heightMaxMm: number
  motorIncluded: boolean
  motorBrand: string | null
  installation: InstallationMode
  installPriceCents: number | null
  priceCents: number
  gst: GstTreatment
  notes: string | null
}

export interface StoredRule extends RuleInput {
  id: string
  brandKey: string
  motorBrandKey: string
  isActive: boolean
}

export type RuleErrors = Partial<Record<keyof RuleInput | 'overlap', string>>

const isWholeMm = (v: number) => Number.isInteger(v) && v >= MEASUREMENT_LIMITS.min && v <= MEASUREMENT_LIMITS.max
const isPrice = (v: number) => Number.isInteger(v) && v > 0 && v <= MAX_PRICE_CENTS

/** Checks one rule on its own and returns it normalised (trimmed text, canonical motor brand, keys). */
export function validateRule(input: RuleInput): { ok: true; rule: RuleInput & { brandKey: string; motorBrandKey: string } } | { ok: false; errors: RuleErrors } {
  const errors: RuleErrors = {}
  if (!CATEGORY_IDS.includes(input.category)) errors.category = 'Choose a product.'
  const brand = input.brand?.trim().replace(/\s+/g, ' ') || null
  if (brand && brand.length > 80) errors.brand = 'Keep the brand under 80 characters.'

  for (const [min, max, label, key] of [
    [input.widthMinMm, input.widthMaxMm, 'width', 'widthMinMm'],
    [input.heightMinMm, input.heightMaxMm, 'height', 'heightMinMm'],
  ] as const) {
    if (!isWholeMm(min) || !isWholeMm(max)) errors[key] = `Enter the ${label} range in whole millimetres between ${MEASUREMENT_LIMITS.min} and ${MEASUREMENT_LIMITS.max}.`
    else if (min > max) errors[key] = `The smallest ${label} must not be more than the largest.`
  }

  let motorBrand = input.motorBrand?.trim().replace(/\s+/g, ' ') || null
  if (!errors.category) {
    const info = categoryInfo(input.category)
    if (info.motorPolicy === 'none' && input.motorIncluded) errors.motorIncluded = `${info.plural} do not take a motor.`
    if (!input.motorIncluded && motorBrand) errors.motorBrand = 'Remove the motor brand, or mark the motor as included.'
    if (input.motorIncluded && info.motorPolicy === 'list') {
      const canonical = motorBrand ? listedMotorBrand(input.category, motorBrand) : null
      if (!canonical) errors.motorBrand = `Choose the motor: ${info.motorBrands.join(', ')}.`
      else motorBrand = canonical
    }
    if (motorBrand && motorBrand.length > 80) errors.motorBrand = 'Keep the motor brand under 80 characters.'
  }

  if (!isPrice(input.priceCents)) errors.priceCents = 'Enter a price above $0.'
  if (input.installation === 'EXTRA') {
    if (input.installPriceCents === null || !isPrice(input.installPriceCents)) errors.installPriceCents = 'Enter the installation price.'
  } else if (input.installPriceCents !== null) errors.installPriceCents = 'An installation price is only used when installation costs extra.'
  if (!['INCLUDED', 'EXTRA', 'NOT_OFFERED'].includes(input.installation)) errors.installation = 'Choose how installation is priced.'
  if (!['INCLUSIVE', 'EXCLUSIVE'].includes(input.gst)) errors.gst = 'Choose whether GST is included.'
  const notes = input.notes?.trim() || null
  if (notes && notes.length > 500) errors.notes = 'Keep the notes under 500 characters.'

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, rule: { ...input, brand, motorBrand, notes, brandKey: brandKey(brand), motorBrandKey: brandKey(motorBrand) } }
}

const rangesTouch = (aMin: number, aMax: number, bMin: number, bMax: number) => aMin <= bMax && bMin <= aMax

/** Same product, brand and motor arrangement, and the size boxes share at least one point. */
export function rulesOverlap(
  a: Pick<StoredRule, 'category' | 'brandKey' | 'motorIncluded' | 'motorBrandKey' | 'widthMinMm' | 'widthMaxMm' | 'heightMinMm' | 'heightMaxMm'>,
  b: Pick<StoredRule, 'category' | 'brandKey' | 'motorIncluded' | 'motorBrandKey' | 'widthMinMm' | 'widthMaxMm' | 'heightMinMm' | 'heightMaxMm'>
): boolean {
  return (
    a.category === b.category &&
    a.brandKey === b.brandKey &&
    a.motorIncluded === b.motorIncluded &&
    a.motorBrandKey === b.motorBrandKey &&
    rangesTouch(a.widthMinMm, a.widthMaxMm, b.widthMinMm, b.widthMaxMm) &&
    rangesTouch(a.heightMinMm, a.heightMaxMm, b.heightMinMm, b.heightMaxMm)
  )
}

/** The first active rule (other than `ignoreId`) the candidate would overlap, if any. */
export function findOverlap<T extends StoredRule>(candidate: Parameters<typeof rulesOverlap>[0], existing: T[], ignoreId?: string): T | null {
  return existing.find((rule) => rule.isActive && rule.id !== ignoreId && rulesOverlap(candidate, rule)) ?? null
}

export interface CustomerRequest {
  category: QuoteProductCategory
  /** null = no brand preference. */
  brand: string | null
  motorChoice: MotorChoice
  motorBrand: string | null
  widthMm: number
  heightMm: number
  installationWanted: boolean
}

export type RequestErrors = Partial<Record<keyof CustomerRequest, string>>

export function validateRequest(input: CustomerRequest): { ok: true; request: CustomerRequest } | { ok: false; errors: RequestErrors } {
  const errors: RequestErrors = {}
  if (!CATEGORY_IDS.includes(input.category)) return { ok: false, errors: { category: 'Choose a product.' } }
  const info = categoryInfo(input.category)
  if (!isWholeMm(input.widthMm)) errors.widthMm = `Enter the ${info.widthLabel.toLowerCase()} in whole millimetres between ${MEASUREMENT_LIMITS.min} and ${MEASUREMENT_LIMITS.max}.`
  if (!isWholeMm(input.heightMm)) errors.heightMm = `Enter the ${info.heightLabel.toLowerCase()} in whole millimetres between ${MEASUREMENT_LIMITS.min} and ${MEASUREMENT_LIMITS.max}.`
  const brand = input.brand?.trim().replace(/\s+/g, ' ') || null
  if (brand && brand.length > 80) errors.brand = 'Keep the brand under 80 characters.'
  let motorBrand: string | null = null
  if (!['NONE', 'ANY', 'BRAND'].includes(input.motorChoice)) errors.motorChoice = 'Choose a motor option.'
  else if (info.motorPolicy === 'none' && input.motorChoice !== 'NONE') errors.motorChoice = `${info.plural} do not take a motor.`
  else if (input.motorChoice === 'BRAND') {
    const raw = input.motorBrand?.trim() ?? ''
    motorBrand = info.motorPolicy === 'list' ? listedMotorBrand(input.category, raw) : raw.replace(/\s+/g, ' ') || null
    if (!motorBrand) errors.motorBrand = info.motorPolicy === 'list' ? `Choose the motor: ${info.motorBrands.join(', ')}.` : 'Name the motor brand, or choose any motor.'
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, request: { ...input, brand, motorBrand } }
}

/** Does this rule describe the product the customer asked for, at their size? */
export function ruleMatches(rule: StoredRule, req: CustomerRequest): boolean {
  if (!rule.isActive || rule.category !== req.category) return false
  if (req.brand !== null && rule.brandKey !== brandKey(req.brand)) return false
  if (req.motorChoice === 'NONE' && rule.motorIncluded) return false
  if (req.motorChoice === 'ANY' && !rule.motorIncluded) return false
  if (req.motorChoice === 'BRAND' && (!rule.motorIncluded || rule.motorBrandKey !== brandKey(req.motorBrand))) return false
  if (req.installationWanted && rule.installation === 'NOT_OFFERED') return false
  return req.widthMm >= rule.widthMinMm && req.widthMm <= rule.widthMaxMm && req.heightMm >= rule.heightMinMm && req.heightMm <= rule.heightMaxMm
}

/** 10% of an ex-GST amount, rounded to the nearest cent (halves up). */
export const gstOn = (exGstCents: number) => Math.floor((exGstCents * GST_RATE_PERCENT + 50) / 100)
/** The GST inside a GST-inclusive amount (one eleventh), rounded to the nearest cent (halves up). */
export const gstWithin = (incGstCents: number) => Math.floor((incGstCents * 2 + 11) / 22)

export interface PriceBreakdown {
  basePriceCents: number
  installPriceCents: number
  gst: GstTreatment
  exGstCents: number
  gstCents: number
  totalCents: number
  installationLine: 'included' | 'extra' | 'not-requested' | 'included-not-removable'
}

/** Prices one matching rule for one request. */
export function priceRule(rule: Pick<StoredRule, 'priceCents' | 'installation' | 'installPriceCents' | 'gst'>, installationWanted: boolean): PriceBreakdown {
  const install = rule.installation === 'EXTRA' && installationWanted ? rule.installPriceCents ?? 0 : 0
  const charged = rule.priceCents + install
  const installationLine =
    rule.installation === 'INCLUDED' ? (installationWanted ? 'included' : 'included-not-removable') : install > 0 ? 'extra' : 'not-requested'
  if (rule.gst === 'EXCLUSIVE') {
    const gst = gstOn(charged)
    return { basePriceCents: rule.priceCents, installPriceCents: install, gst: rule.gst, exGstCents: charged, gstCents: gst, totalCents: charged + gst, installationLine }
  }
  const gst = gstWithin(charged)
  return { basePriceCents: rule.priceCents, installPriceCents: install, gst: rule.gst, exGstCents: charged - gst, gstCents: gst, totalCents: charged, installationLine }
}

export type CompanyQuoteResult =
  | { status: 'QUOTED'; rule: StoredRule; price: PriceBreakdown; reason?: undefined }
  | { status: 'UNAVAILABLE'; reason: string; rule?: undefined; price?: undefined }

/**
 * Everything one company can quote for a request: one result per distinct
 * product (brand and motor) whose rule covers the request, or a single
 * UNAVAILABLE result explaining why not. Never invents a price.
 */
export function quoteFromRules(rules: StoredRule[], req: CustomerRequest): CompanyQuoteResult[] {
  const active = rules.filter((r) => r.isActive && r.category === req.category)
  const info = categoryInfo(req.category)
  if (!active.length) return [{ status: 'UNAVAILABLE', reason: `This company has no automated pricing for ${info.plural.toLowerCase()}.` }]
  const matches = active.filter((r) => ruleMatches(r, req))
  if (!matches.length) return [{ status: 'UNAVAILABLE', reason: unavailableReason(active, req) }]

  const groups = new Map<string, StoredRule[]>()
  for (const r of matches) {
    const key = `${r.brandKey}|${r.motorIncluded}|${r.motorBrandKey}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const out: CompanyQuoteResult[] = []
  for (const group of groups.values()) {
    // Saving overlapping rules is refused, so this only happens if that
    // check was bypassed. Quote nothing rather than pick one.
    if (group.length > 1) out.push({ status: 'UNAVAILABLE', reason: 'This company has more than one price for this exact product and size, so no automated quote can be given. Ask the company directly.' })
    else out.push({ status: 'QUOTED', rule: group[0], price: priceRule(group[0], req.installationWanted) })
  }
  return out.sort((a, b) => (a.status === b.status ? (a.price?.totalCents ?? 0) - (b.price?.totalCents ?? 0) : a.status === 'QUOTED' ? -1 : 1))
}

/** Plain-English reason no rule matched, from the first requirement no active rule meets. */
function unavailableReason(rules: StoredRule[], req: CustomerRequest): string {
  const prefix = 'No automated quote is available for this configuration:'
  const byBrand = req.brand === null ? rules : rules.filter((r) => r.brandKey === brandKey(req.brand))
  if (!byBrand.length) return `${prefix} this company has no automated pricing for the ${req.brand} brand.`
  const byMotor = byBrand.filter((r) => ruleMatches({ ...r, widthMinMm: req.widthMm, widthMaxMm: req.widthMm, heightMinMm: req.heightMm, heightMaxMm: req.heightMm, installation: 'INCLUDED' }, req))
  if (!byMotor.length) {
    if (req.motorChoice === 'NONE') return `${prefix} this company's automated prices all include a motor.`
    if (req.motorChoice === 'ANY') return `${prefix} this company has no automated price that includes a motor.`
    return `${prefix} this company has no automated price with a ${req.motorBrand} motor for this product.`
  }
  const bySize = byMotor.filter((r) => req.widthMm >= r.widthMinMm && req.widthMm <= r.widthMaxMm && req.heightMm >= r.heightMinMm && req.heightMm <= r.heightMaxMm)
  if (!bySize.length) return `${prefix} your measurements (${req.widthMm} × ${req.heightMm} mm) are outside the sizes this company prices automatically.`
  return `${prefix} this company only quotes this product as supply only, without installation.`
}
