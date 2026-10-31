import { z } from 'zod'
import type { GstTreatmentId, InstallationTermsId, PriceTypeId, PricedProductId } from './engine'
import { GARAGE_STYLES, motorBrandIsListed, motorBrandsFor, PRICED_PRODUCTS } from './products'

/**
 * Reads a business's price form. Everything a customer will be charged
 * passes through here, so it is strict: whole millimetres, at most two
 * decimal places of currency, ranges that make sense, and a motor brand
 * only from the product's own list.
 */

export interface RuleInput {
  product: PricedProductId
  productStyle: string | null
  productBrand: string | null
  productModel: string | null
  material: string | null
  priceType: PriceTypeId
  motorIncluded: boolean
  motorBrand: string | null
  motorAddOnCents: number | null
  installation: InstallationTermsId
  installPriceCents: number | null
  minWidthMm: number
  maxWidthMm: number
  minHeightMm: number
  maxHeightMm: number
  priceCents: number
  gst: GstTreatmentId
  note: string | null
  active: boolean
}

/** Materials a gate or fence price can be limited to (the designer's list). */
export const RULE_MATERIALS = [
  { id: 'aluminium', label: 'Aluminium' },
  { id: 'tubular-steel', label: 'Tubular steel' },
  { id: 'solid-steel', label: 'Solid steel' },
] as const

export const SIZE_BOUNDS = { min: 100, max: 20000 } as const
const MAX_PRICE_CENTS = 100_000_000 // $1,000,000

const mm = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .int(`${label} must be whole millimetres.`)
    .min(SIZE_BOUNDS.min, `${label} must be at least ${SIZE_BOUNDS.min} mm.`)
    .max(SIZE_BOUNDS.max, `${label} must be at most ${SIZE_BOUNDS.max} mm.`)

/** "3000", "3,000.50" or "$3000" → 300000 cents; anything else → null. */
export function parseMoney(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((value) => (value === '' ? null : value))

const schema = z.object({
  product: z.enum(PRICED_PRODUCTS.map((p) => p.id) as [PricedProductId, ...PricedProductId[]], {
    errorMap: () => ({ message: 'Choose a product.' }),
  }),
  productStyle: z.string().trim(),
  productBrand: optionalText(60),
  productModel: optionalText(80),
  material: z.string().trim(),
  priceType: z.enum(['FIXED', 'ESTIMATE'], {
    errorMap: () => ({ message: 'Say whether the price is fixed or an estimate.' }),
  }),
  motorAddOn: z.string().trim(),
  motorIncluded: z.enum(['yes', 'no'], { errorMap: () => ({ message: 'Say whether a motor is included.' }) }),
  motorBrand: optionalText(60),
  installation: z.enum(['INCLUDED', 'SEPARATE', 'NOT_INCLUDED'], {
    errorMap: () => ({ message: 'Choose the installation terms.' }),
  }),
  installPrice: z.string().trim(),
  minWidthMm: mm('Minimum width'),
  maxWidthMm: mm('Maximum width'),
  minHeightMm: mm('Minimum height'),
  maxHeightMm: mm('Maximum height'),
  price: z.string().trim(),
  gst: z.enum(['INCLUSIVE', 'EXCLUSIVE'], {
    errorMap: () => ({ message: 'Say whether the price includes GST.' }),
  }),
  note: optionalText(300),
  active: z.boolean(),
})

export type RuleValidation = { ok: true; data: RuleInput } | { ok: false; error: string }

export function readRuleForm(formData: FormData): RuleValidation {
  const parsed = schema.safeParse({
    product: formData.get('product'),
    productStyle: formData.get('productStyle') ?? '',
    productBrand: formData.get('productBrand') ?? '',
    productModel: formData.get('productModel') ?? '',
    material: formData.get('material') ?? '',
    priceType: formData.get('priceType') ?? 'FIXED',
    motorAddOn: formData.get('motorAddOn') ?? '',
    motorIncluded: formData.get('motorIncluded'),
    motorBrand: formData.get('motorBrand') ?? '',
    installation: formData.get('installation'),
    installPrice: formData.get('installPrice') ?? '',
    minWidthMm: formData.get('minWidthMm'),
    maxWidthMm: formData.get('maxWidthMm'),
    minHeightMm: formData.get('minHeightMm'),
    maxHeightMm: formData.get('maxHeightMm'),
    price: formData.get('price') ?? '',
    gst: formData.get('gst'),
    note: formData.get('note') ?? '',
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  const input = parsed.data

  if (input.minWidthMm > input.maxWidthMm)
    return { ok: false, error: 'Minimum width is larger than maximum width.' }
  if (input.minHeightMm > input.maxHeightMm) {
    return { ok: false, error: 'Minimum height is larger than maximum height.' }
  }

  const priceCents = parseMoney(input.price)
  if (priceCents === null || priceCents <= 0) {
    return { ok: false, error: 'Enter a price in dollars, like 3000 or 3000.50.' }
  }
  if (priceCents > MAX_PRICE_CENTS) return { ok: false, error: 'That price is larger than the app accepts.' }

  let productStyle: string | null = null
  if (input.product === 'GARAGE_DOOR' && input.productStyle) {
    if (!GARAGE_STYLES.some((s) => s.id === input.productStyle))
      return { ok: false, error: 'Choose a garage door style.' }
    productStyle = input.productStyle
  }

  const motorIncluded = input.motorIncluded === 'yes'
  let motorBrand: string | null = null
  if (input.product === 'FENCE' && motorIncluded) return { ok: false, error: 'Fences have no motor.' }
  if (motorIncluded && input.motorBrand) {
    if (motorBrandIsListed(input.product)) {
      if (!motorBrandsFor(input.product).some((b) => b.id === input.motorBrand)) {
        return { ok: false, error: 'Choose a motor brand from the list.' }
      }
    }
    motorBrand = input.motorBrand
  }

  let material: string | null = null
  if (input.material) {
    if (!['SLIDING_GATE', 'SWING_GATE', 'PEDESTRIAN_GATE', 'FENCE'].includes(input.product))
      return { ok: false, error: 'Material applies to gates and fences only.' }
    if (!RULE_MATERIALS.some((m) => m.id === input.material)) return { ok: false, error: 'Choose a material.' }
    material = input.material
  }

  // A manual price can offer a motor as an add-on. Its brand, if named,
  // is the same motor brand field.
  let motorAddOnCents: number | null = null
  if (!motorIncluded && input.motorAddOn) {
    if (input.product === 'FENCE') return { ok: false, error: 'Fences have no motor.' }
    motorAddOnCents = parseMoney(input.motorAddOn)
    if (motorAddOnCents === null || motorAddOnCents <= 0)
      return { ok: false, error: 'Enter the motor add-on price in dollars.' }
    if (motorAddOnCents > MAX_PRICE_CENTS) return { ok: false, error: 'That motor price is too large.' }
    if (input.motorBrand) {
      if (motorBrandIsListed(input.product) && !motorBrandsFor(input.product).some((b) => b.id === input.motorBrand))
        return { ok: false, error: 'Choose a motor brand from the list.' }
      motorBrand = input.motorBrand
    }
  }

  let installPriceCents: number | null = null
  if (input.installation === 'SEPARATE') {
    installPriceCents = parseMoney(input.installPrice)
    if (installPriceCents === null || installPriceCents <= 0) {
      return { ok: false, error: 'Enter the installation price in dollars.' }
    }
    if (installPriceCents > MAX_PRICE_CENTS)
      return { ok: false, error: 'That installation price is too large.' }
  }

  return {
    ok: true,
    data: {
      product: input.product,
      productStyle,
      productBrand: input.productBrand,
      productModel: input.productModel,
      material,
      priceType: input.priceType,
      motorIncluded,
      motorBrand,
      motorAddOnCents,
      installation: input.installation,
      installPriceCents,
      minWidthMm: input.minWidthMm,
      maxWidthMm: input.maxWidthMm,
      minHeightMm: input.minHeightMm,
      maxHeightMm: input.maxHeightMm,
      priceCents,
      gst: input.gst,
      note: input.note,
      active: input.active,
    },
  }
}
