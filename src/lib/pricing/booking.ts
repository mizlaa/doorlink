import { z } from 'zod'
import { AU_STATES, isAuPostcode } from '@/lib/australia'
import { isAuPhone } from '@/lib/business-details'

/** What a customer tells the business when they book a quote. */

export const BOOKING_TIMINGS = [
  { id: 'asap', label: 'As soon as possible' },
  { id: 'two-weeks', label: 'Within 2 weeks' },
  { id: 'month', label: 'Within a month' },
  { id: 'flexible', label: 'I’m flexible' },
] as const

export type BookingTiming = (typeof BOOKING_TIMINGS)[number]['id']

export function timingLabel(id: string | null): string | null {
  return BOOKING_TIMINGS.find((t) => t.id === id)?.label ?? null
}

export interface BookingInput {
  optionId: string
  name: string
  phone: string
  address: string
  suburb: string
  state: string
  postcode: string
  timing: BookingTiming
  notes: string | null
}

const schema = z.object({
  optionId: z.string().trim().min(1, 'Choose an option to book.'),
  name: z.string().trim().min(2, 'Enter your name.').max(120),
  phone: z.string().trim().refine(isAuPhone, 'Enter an Australian phone number the company can call.'),
  address: z.string().trim().min(3, 'Enter the street address for the job.').max(200),
  suburb: z.string().trim().min(2, 'Enter the suburb.').max(60),
  state: z.enum(AU_STATES, { message: 'Choose a state.' }),
  postcode: z.string().trim().refine(isAuPostcode, 'Postcodes are 4 digits.'),
  timing: z.enum(BOOKING_TIMINGS.map((t) => t.id) as [BookingTiming, ...BookingTiming[]], {
    message: 'Choose when you’d like it done.',
  }),
  notes: z
    .string()
    .trim()
    .max(1000, 'Keep notes under 1000 characters.')
    .transform((v) => (v === '' ? null : v)),
})

export function readBookingForm(
  formData: FormData
): { ok: true; data: BookingInput } | { ok: false; error: string } {
  const get = (key: string) => String(formData.get(key) ?? '')
  const parsed = schema.safeParse({
    optionId: get('optionId'),
    name: get('name'),
    phone: get('phone'),
    address: get('address'),
    suburb: get('suburb'),
    state: get('state'),
    postcode: get('postcode'),
    timing: get('timing'),
    notes: get('notes'),
  })
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the booking details.' }
  return { ok: true, data: parsed.data }
}
