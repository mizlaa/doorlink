import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { subscriptionCheckoutAvailable } from '@/lib/payments'
import { refreshOpenStripeSubscriptions } from '@/lib/payments/subscription-sync'
import { Button } from '@/components/ui/Button'
import { openBillingPortal } from './actions'
import { entitlementsFor, FEATURE_LABELS } from '@/lib/entitlements'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels'

export const metadata: Metadata = { title: 'Subscription' }

const INTERVAL_SUFFIX = { WEEK: 'per week', MONTH: 'per month', YEAR: 'per year' } as const

type PageProps = { searchParams: Promise<{ checkout?: string }> }

export default async function SubscriptionPage({ searchParams }: PageProps) {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  const params = await searchParams

  let history
  try {
    history = await prisma.subscription.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Your subscription" reason="Can't reach the database right now." />
      </div>
    )
  }

  if (subscriptionCheckoutAvailable()) {
    try {
      await refreshOpenStripeSubscriptions(session.userId)
      history = await prisma.subscription.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      })
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
  }

  const entitlements = await entitlementsFor(session.userId)
  const checkoutReady = subscriptionCheckoutAvailable()
  const current = history.find((row) => row.status === entitlements.status) ?? null
  const canManage = checkoutReady && Boolean(current?.providerCustomerId)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <nav className="mb-6 text-sm">
        <Link href="/account" className="font-medium text-signal hover:text-signal-hover">
          Account
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Subscription</h1>
      </header>

      {params.checkout === 'success' && !entitlements.subscribed && (
        <div className="mb-8 rounded-md border border-line bg-rail p-4 text-sm text-graphite-soft">
          Payment submitted. Stripe still has to confirm your subscription — this page will update once the
          webhook lands. If nothing changes after a minute, contact support.
        </div>
      )}

      {params.checkout === 'cancel' && (
        <div className="mb-8 rounded-md border border-line bg-rail p-4 text-sm text-graphite-soft">
          Checkout was cancelled. You have not been charged.
        </div>
      )}

      <section className="mb-10">
        {current ? (
          <div className="rounded-md border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-graphite">{current.plan.name}</p>
                <p className="mt-1 text-sm text-zinc-deep">
                  {current.plan.priceCents !== null
                    ? `${formatMoney(current.plan.priceCents, current.plan.currency)} ${INTERVAL_SUFFIX[current.plan.interval]}`
                    : 'Pricing not set'}
                </p>
              </div>
              <Badge
                tone={
                  current.cancelAtPeriodEnd
                    ? 'caution'
                    : current.status === 'ACTIVE' || current.status === 'TRIALING'
                      ? 'good'
                      : 'caution'
                }
              >
                {current.cancelAtPeriodEnd ? 'Cancelling' : SUBSCRIPTION_STATUS_LABELS[current.status]}
              </Badge>
            </div>

            {current.currentPeriodEnd && (
              <p className="mt-4 text-sm text-graphite-soft">
                {current.cancelAtPeriodEnd ? 'Access ends' : 'Renews'} on{' '}
                {current.currentPeriodEnd.toLocaleDateString('en-AU', { dateStyle: 'long' })}.
              </p>
            )}

            {canManage && (
              <form action={openBillingPortal} className="mt-5">
                <Button type="submit" variant="secondary">
                  Manage subscription
                </Button>
              </form>
            )}
          </div>
        ) : (
          <EmptyState
            title="You're on the free plan"
            description="Everything in Doorlink is available to you right now. Nothing is behind the subscription yet."
          />
        )}
      </section>

      {!checkoutReady && (
        <div className="mb-10">
          <NotConnected
            feature="Changing your plan"
            reason="Cancelling and updating a card happen in Stripe. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to open the billing portal from this page."
          />
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
          What your plan affects
        </h2>
        {entitlements.gated.size === 0 ? (
          <p className="text-graphite-soft">
            Nothing, today. No feature is gated behind a subscription. Which features become premium is an
            admin setting, not something compiled into the app, so it can be decided once the business model is.{' '}
            <Link href="/plans" className="font-medium text-signal hover:text-signal-hover">
              See the plans
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...entitlements.gated].map((feature) => (
              <li
                key={feature}
                className="flex items-center justify-between rounded-md border border-line bg-paper px-4 py-3 text-sm"
              >
                <span className="text-graphite">{FEATURE_LABELS[feature]}</span>
                <Badge tone={entitlements.has(feature) ? 'good' : 'neutral'}>
                  {entitlements.has(feature) ? 'Included' : 'Needs a subscription'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
          Subscription history
        </h2>
        {history.length === 0 ? (
          <EmptyState title="Nothing yet" />
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
              >
                <span className="text-graphite">{row.plan.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-micro text-zinc-deep">
                    started {row.createdAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                  </span>
                  <Badge tone="neutral">
                    {row.cancelAtPeriodEnd && row.status !== 'CANCELLED'
                      ? 'Cancelling'
                      : SUBSCRIPTION_STATUS_LABELS[row.status]}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
