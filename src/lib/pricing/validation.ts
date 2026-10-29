import { z } from 'zod'
import type { GstTreatmentId, InstallationTermsId, PricedProductId } from './engine'
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
  note: string | null
  active: boolean
}

export const SIZE_BOUNDS = { min: 100, max: 20000 } as const
const MAX_PRICE_CENTS = 100_000_000 // $1,000,000

const mm = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
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
    message: 'Choose a product.',
  }),
  productStyle: z.string().trim(),
  productBrand: optionalText(60),
  motorIncluded: z.enum(['yes', 'no'], { message: 'Say whether a motor is included.' }),
  motorBrand: optionalText(60),
  installation: z.enum(['INCLUDED', 'SEPARATE', 'NOT_INCLUDED'], {
    message: 'Choose the installation terms.',
  }),
  installPrice: z.string().trim(),
  minWidthMm: mm('Minimum width'),
  maxWidthMm: mm('Maximum width'),
  minHeightMm: mm('Minimum height'),
  maxHeightMm: mm('Maximum height'),
  price: z.string().trim(),
  gst: z.enum(['INCLUSIVE', 'EXCLUSIVE'], {
    message: 'Say whether the price includes GST.',
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
      motorIncluded,
      motorBrand,
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
