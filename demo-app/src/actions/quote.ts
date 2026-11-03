import { z } from 'zod'
import { parseSpec, type DoorSpec } from '@/lib/configurator/options'
import { isAuPostcode } from '@/lib/australia'
import { isAccessoryId } from '@/lib/pricing/accessories'
import { navigate } from '../router'
import { getDemo } from '../demo/store'
import { compareQuotes } from '../demo/flows'

export type CompareState = { error?: string }

const schema = z.object({
  postcode: z.string().trim().refine(isAuPostcode, 'Enter the 4-digit postcode where the work is.'),
  suburb: z.string().trim().max(60),
  brand: z.string().trim().max(60, 'That brand name is too long.'),
})

// Demo stand-in for compareQuotesAction: same checks, prices from the real engine.
export async function compareQuotesAction(_prev: CompareState, formData: FormData): Promise<CompareState> {
  const session = getDemo().session
  if (!session) return { error: 'Sign in with a customer account to compare quotes.' }
  if (session.role !== 'CUSTOMER') return { error: 'Quote comparison is for customer accounts.' }
  let spec: DoorSpec
  try {
    spec = parseSpec(JSON.parse(String(formData.get('spec') ?? '')))
  } catch {
    return { error: 'The design could not be read. Go back to Design and try again.' }
  }
  const parsed = schema.safeParse({
    postcode: formData.get('postcode') ?? '',
    suburb: formData.get('suburb') ?? '',
    brand: formData.get('brand') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  await new Promise((r) => setTimeout(r, 450))
  const reference = compareQuotes({
    spec,
    postcode: parsed.data.postcode,
    suburb: parsed.data.suburb || null,
    brand: parsed.data.brand === '' ? null : parsed.data.brand,
    installRequired: formData.get('install') !== 'supply',
    accessories: formData.getAll('accessories').map(String).filter(isAccessoryId),
  })
  navigate(`/compare/${reference}`)
  return {}
}
