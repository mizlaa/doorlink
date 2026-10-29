import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'

/**
 * The business pricing area. Technician and supplier accounts with an
 * active trade subscription only; the same checks run again in every
 * action, so this layout is the friendly front, not the lock.
 */
export default async function PricingLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/pricing')

  if (!can(session.role, 'pricing:write:own')) {
    return (
      <div className="mx-auto max-w-prose px-4 py-16">
        <h1 className="text-xl font-semibold text-graphite">Automated pricing is for businesses</h1>
        <p className="mt-2 text-sm text-graphite-soft">
          Technician and supplier accounts set their own prices here. To get a price for your design, use{' '}
          <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
            Design
          </Link>{' '}
          and choose a company.
        </p>
      </div>
    )
  }

  const access = await tradeSubscriptionAccess(session)
  if (!access.allowed) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <TradeSubscriptionPaywall />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Your business</p>
          <h1 className="text-2xl font-semibold text-graphite">Automated pricing</h1>
          <p className="mt-1 text-sm text-graphite-soft">Only your business can see these prices.</p>
        </div>
        <nav
          className="flex gap-1 rounded-lg border border-line bg-rail p-1 text-sm font-medium"
          aria-label="Pricing"
        >
          <Link href="/pricing" className="rounded-md px-3 py-1.5 text-graphite hover:bg-paper">
            Prices
          </Link>
          <Link href="/pricing/quotes" className="rounded-md px-3 py-1.5 text-graphite hover:bg-paper">
            Quotes &amp; bookings
          </Link>
          <Link href="/pricing/business" className="rounded-md px-3 py-1.5 text-graphite hover:bg-paper">
            Business details
          </Link>
        </nav>
      </div>
      {children}
    </div>
  )
}
