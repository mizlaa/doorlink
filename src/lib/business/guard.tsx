import 'server-only'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSession, type Session } from '@/lib/auth'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { BusinessAccessError, requireBusinessRole, type BusinessContext, type BusinessRole } from './access'

/**
 * The front door for business pages. Returns the session and the business,
 * or the screen to show instead: sign-in, a paywall, or a plain "not for
 * this account". The same check runs again inside every action.
 */
export async function businessPage(
  min: BusinessRole,
  next: string
): Promise<{ ok: true; session: Session; business: BusinessContext } | { ok: false; screen: ReactNode }> {
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  try {
    return { ok: true, session, business: await requireBusinessRole(session, min) }
  } catch (error) {
    if (!(error instanceof BusinessAccessError)) throw error
    if (error.reason === 'subscription')
      return {
        ok: false,
        screen: (
          <div className="mx-auto max-w-shell px-4 py-10">
            <TradeSubscriptionPaywall />
          </div>
        ),
      }
    return {
      ok: false,
      screen: (
        <div className="mx-auto max-w-prose px-4 py-16">
          <h1 className="text-xl font-semibold text-graphite">
            {error.reason === 'role' ? 'That’s for the owner or a manager' : 'This area is for businesses and their teams'}
          </h1>
          <p className="mt-2 text-sm text-graphite-soft">
            {error.reason === 'role'
              ? 'Your role in this business doesn’t include this screen. Your own visits are on Today.'
              : 'Installer and supplier accounts run their requests, calendar and invoices here.'}
          </p>
          <Link href={error.reason === 'role' ? '/today' : '/'} className="mt-4 inline-block text-sm font-medium text-signal hover:text-signal-hover">
            {error.reason === 'role' ? 'Go to Today' : 'Back to Doorlink'}
          </Link>
        </div>
      ),
    }
  }
}

/** The same gate for server actions: the business, or an error message. */
export async function businessAction(min: BusinessRole): Promise<{ ok: true; session: Session; business: BusinessContext } | { ok: false; error: string }> {
  const session = await getSession()
  try {
    const business = await requireBusinessRole(session, min)
    return { ok: true, session: session!, business }
  } catch (error) {
    if (error instanceof BusinessAccessError) return { ok: false, error: error.message }
    throw error
  }
}
