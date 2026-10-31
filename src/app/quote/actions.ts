'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession, type Session } from '@/lib/auth'
import { parseSpec, type DoorSpec } from '@/lib/configurator/options'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { RbacError, requirePermission } from '@/lib/rbac'
import { isAuPostcode } from '@/lib/australia'
import { isAccessoryId } from '@/lib/pricing/accessories'
import { compareQuotes } from '@/lib/pricing/compare'
import { requestFromSpec } from '@/lib/pricing/products'

export type CompareState = { error?: string }

const schema = z.object({
  postcode: z.string().trim().refine(isAuPostcode, 'Enter the 4-digit postcode where the work is.'),
  suburb: z.string().trim().max(60),
  brand: z.string().trim().max(60, 'That brand name is too long.'),
})

/**
 * "Compare free quotes". Free, and for customer accounts only, so
 * businesses can't read each other's prices. The design is re-validated
 * here; every price comes from the businesses' own rules on the server.
 */
export async function compareQuotesAction(_prev: CompareState, formData: FormData): Promise<CompareState> {
  let session: Session
  try {
    session = requirePermission(await getSession(), 'quote:request')
  } catch (error) {
    if (error instanceof RbacError) {
      return {
        error:
          error.status === 401
            ? 'Sign in with a customer account to compare quotes.'
            : 'Quote comparison is for customer accounts.',
      }
    }
    throw error
  }

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

  const request = requestFromSpec(spec, {
    brand: parsed.data.brand === '' ? null : parsed.data.brand,
    installRequired: formData.get('install') !== 'supply',
  })
  const accessories = formData.getAll('accessories').map(String).filter(isAccessoryId)

  let reference: string
  try {
    reference = await compareQuotes({
      customerId: session.userId,
      customerFirstName: session.name.split(' ')[0],
      spec,
      request,
      postcode: parsed.data.postcode,
      suburb: parsed.data.suburb || null,
      accessories,
    })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }
  redirect(`/compare/${reference}`)
}
