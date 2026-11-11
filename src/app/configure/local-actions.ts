'use server'

import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { parseSpec } from '@/lib/configurator/options'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { LOCATION_COOKIE, locationCookieValue, readLocation, type CustomerLocation } from '@/lib/location'
import { localCompanies, type LocalCompany } from '@/lib/pricing/local'
import { limitFor } from '@/lib/rate-limit'
import { can } from '@/lib/rbac'

export type LocalQuotesResult =
  | { ok: true; location: CustomerLocation; companies: LocalCompany[]; pricesShown: boolean }
  | { ok: false; error: string }

/**
 * The companies for the designer's "Compare Local Quotes" list.
 *
 * Open to visitors and customers. A signed-in trade account is shown the
 * companies but not their prices: a business's price list is not for
 * another business to read. Calls are rate limited per visitor.
 */
export async function localQuotesAction(input: { spec: string; postcode: string; suburb?: string }): Promise<LocalQuotesResult> {
  const location = readLocation(input)
  if (!location) return { ok: false, error: 'Enter a 4-digit Australian postcode.' }

  let spec
  try {
    spec = parseSpec(JSON.parse(input.spec))
  } catch {
    return { ok: false, error: 'That design could not be read.' }
  }

  const limited = await limitFor('localQuotes')
  if (!limited.ok) return { ok: false, error: 'You’re changing things quickly. Give it a moment and try again.' }

  const session = await getSession()
  const pricesShown = !session || !can(session.role, 'pricing:write:own')

  // Remember where they are for the quote and measure pages.
  const store = await cookies()
  store.set(LOCATION_COOKIE, locationCookieValue(location), {
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  try {
    const companies = await localCompanies(spec, location.postcode, { showPrices: pricesShown })
    return { ok: true, location, companies, pricesShown }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { ok: false, error: 'Local companies can’t be loaded right now.' }
    throw error
  }
}
