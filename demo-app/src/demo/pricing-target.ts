import type { DemoSession } from './store'
import { COMPANIES } from './data'

/**
 * Which business's prices the pricing screens act on. A technician or
 * supplier always edits their own; the demo admin picks a business (the
 * `?business=` on /pricing) and edits that one, so an admin change shows
 * up in the customer's next comparison straight away.
 */
let adminTarget: string = COMPANIES[0].id

export function setAdminPricingTarget(companyId: string | null | undefined) {
  if (companyId && COMPANIES.some((c) => c.id === companyId)) adminTarget = companyId
}

export function pricingBusinessFor(session: DemoSession | null): string | null {
  if (!session) return null
  if (session.role === 'ADMIN') return adminTarget
  if ((session.role === 'TECHNICIAN' || session.role === 'SUPPLIER') && session.companyId) return session.companyId
  return null
}

/** Keeps the admin's chosen business in the URL when moving between pricing screens. */
export function pricingHref(session: DemoSession | null, href: string): string {
  if (session?.role !== 'ADMIN') return href
  return `${href}${href.includes('?') ? '&' : '?'}business=${adminTarget}`
}
