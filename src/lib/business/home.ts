import 'server-only'

import { cache } from 'react'
import type { Session } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { businessContexts, roleAtLeast } from './access'

/**
 * Each person's main place to work, for the navigation: an owner or office
 * manager's business, a technician's Today, a customer's own records.
 */
export const workHomeFor = cache(async (session: Session): Promise<{ href: string; label: string } | null> => {
  if (session.role === 'CUSTOMER') {
    try {
      const [membership] = await businessContexts(session)
      if (membership) return roleAtLeast(membership.role, 'MANAGER') ? { href: '/business', label: 'Business' } : { href: '/today', label: 'Today' }
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
    return { href: '/portal', label: 'My home' }
  }
  if (session.role === 'TECHNICIAN' || session.role === 'SUPPLIER') {
    try {
      const [first] = await businessContexts(session)
      if (first && !roleAtLeast(first.role, 'MANAGER')) return { href: '/today', label: 'Today' }
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
    return { href: '/business', label: 'Business' }
  }
  return null
})
