import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { prisma } from '@/lib/prisma'
import { ensureBusinessProfile, profileChecklist } from '@/lib/business/profile'
import { businessKeyFor, loadBusinessDetails, ruleOwnerWhere } from '@/lib/pricing/business'

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

  const key = businessKeyFor(session)
  const [profile, details, priceCount] = await Promise.all([
    ensureBusinessProfile(key),
    loadBusinessDetails(key),
    prisma.pricingRule.count({ where: { ...ruleOwnerWhere(key), active: true } }),
  ])
  const checklist = profileChecklist(profile, {
    hasDetails: !!details?.businessName && !!details.phone && !!details.email,
    hasPrices: priceCount > 0,
    subscribed: true,
  })
  const tabs = [
    { href: '/pricing', label: 'Prices' },
    { href: '/pricing/quotes', label: 'Quotes & jobs' },
    { href: '/pricing/profile', label: 'Profile' },
    { href: '/pricing/payments', label: 'Payments' },
    { href: '/pricing/business', label: 'Details' },
  ]

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      {profile.status === 'SUSPENDED' ? (
        <div role="status" className="mb-6 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-graphite">
          <p className="font-semibold">Your business is suspended.</p>
          <p className="mt-1">
            Customers can’t see it or book it. {profile.statusNote ?? 'Contact Doorlink support for details.'}
          </p>
        </div>
      ) : profile.status === 'PENDING' ? (
        <div role="status" className="mb-6 rounded-lg border border-caution/30 bg-caution-tint px-4 py-3 text-sm text-graphite">
          <p className="font-semibold">Waiting for Doorlink approval</p>
          <p className="mt-1 text-graphite-soft">
            Customers can’t see your business until it’s approved. Finish these so we can review it:
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span aria-hidden="true" className={item.done ? 'text-good' : 'text-zinc-deep'}>
                  {item.done ? '✓' : '○'}
                </span>
                <span className={item.done ? 'text-graphite-soft line-through' : ''}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Business dashboard</p>
          <h1 className="text-2xl font-semibold text-graphite">{details?.businessName || 'Your business'}</h1>
          <p className="mt-1 text-sm text-graphite-soft">
            {profile.status === 'APPROVED' ? 'Live on Doorlink. ' : ''}Your prices and settings are private to your business.
          </p>
        </div>
        <nav
          className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border border-line bg-rail p-1 text-sm font-medium"
          aria-label="Your business"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="shrink-0 rounded-md px-3 py-1.5 text-graphite hover:bg-paper"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}
