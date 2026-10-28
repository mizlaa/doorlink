import { z } from 'zod'
import { AU_STATES, isAuPostcode } from './australia'

/**
 * A business's public and contact details: entered once at sign-up,
 * editable later, and used for the company card customers choose from
 * and for where quote and booking alerts go.
 */

/**
 * The ATO's ABN check: subtract 1 from the first digit, weight the 11
 * digits by 10, 1, 3, 5 … 19, and the sum must divide by 89. Catches a
 * mistyped ABN without looking anything up.
 */
export function isValidAbn(value: string): boolean {
  const digits = value.replace(/\s+/g, '')
  if (!/^\d{11}$/.test(digits)) return false
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const sum = digits
    .split('')
    .map(Number)
    .reduce((total, digit, i) => total + (i === 0 ? digit - 1 : digit) * weights[i], 0)
  return sum % 89 === 0
}

/** "51 824 753 556" — how an ABN is written. */
export function formatAbn(value: string): string {
  const d = value.replace(/\s+/g, '')
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
}

/** An Australian phone number: landline, mobile, 13/1300/1800, with or without +61. */
export function isAuPhone(value: string): boolean {
  const compact = value.replace(/[\s()-]/g, '')
  return /^(\+?61|0)[2-478]\d{8}$/.test(compact) || /^1(3\d{4}|[38]00\d{6})$/.test(compact)
}

export interface BusinessDetailsInput {
  businessName: string
  phone: string
  email: string
  abn: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))

const schema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'Enter your business name.')
    .max(120, 'Keep the business name under 120 characters.'),
  phone: z.string().trim().refine(isAuPhone, 'Enter an Australian phone number, like 0412 345 678.'),
  email: z.string().trim().toLowerCase().email('Enter the email for quote alerts.'),
  abn: optional(20).refine((v) => v === null || isValidAbn(v), 'That ABN isn’t valid. Check the 11 digits.'),
  suburb: optional(60),
  state: optional(3).refine(
    (v) => v === null || (AU_STATES as readonly string[]).includes(v),
    'Choose a state.'
  ),
  postcode: optional(4).refine((v) => v === null || isAuPostcode(v), 'Postcodes are 4 digits.'),
})

export type BusinessDetailsResult = { ok: true; data: BusinessDetailsInput } | { ok: false; error: string }

/** Reads business details from a form. `prefix` lets sign-up namespace its fields. */
export function readBusinessDetails(formData: FormData, prefix = ''): BusinessDetailsResult {
  const field = (name: string) => String(formData.get(`${prefix}${name}`) ?? '')
  const parsed = schema.safeParse({
    businessName: field('businessName'),
    phone: field('businessPhone'),
    email: field('businessEmail'),
    abn: field('abn'),
    suburb: field('suburb'),
    state: field('state'),
    postcode: field('postcode'),
  })
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your business details.' }
  const data = parsed.data
  return { ok: true, data: { ...data, abn: data.abn ? data.abn.replace(/\s+/g, '') : null } }
}
