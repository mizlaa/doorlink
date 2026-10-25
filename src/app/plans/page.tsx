import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { subscriptionCheckoutAvailable } from '@/lib/payments'
import { entitlementsFor } from '@/lib/entitlements'
import { roleRequiresTradeSubscription } from '@/lib/trade-subscription'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels'
import { PlansSubscribePanel } from './PlansSubscribePanel'

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Doorlink subscription plans.',
  alternates: { canonical: '/plans' },
}

const INTERVAL_SUFFIX = { WEEK: 'per week', MONTH: 'per month', YEAR: 'per year' } as const

export default async function PlansPage() {
  const session = await getSession()
  if (session && !roleRequiresTradeSubscription(session.role)) redirect('/account')

  let plans
  try {
    plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Plans" reason="Can't reach the database right now." />
      </div>
    )
  }

  const entitlements = await entitlementsFor(session?.userId ?? null)
  const checkoutReady = subscriptionCheckoutAvailable()
  const tradeAccount = session ? roleRequiresTradeSubscription(session.role) : false

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Doorlink plans</h1>
        <p className="mt-2 text-graphite-soft">
          Trade accounts pay monthly. Customers use Doorlink free.
        </p>
      </header>

      {entitlements.subscribed && (
        <div className="mb-8 rounded-md border border-good/30 bg-good/5 p-4">
          <p className="text-sm text-graphite">
            You are on <span className="font-medium">{entitlements.planName}</span>
            {entitlements.status && ` (${SUBSCRIPTION_STATUS_LABELS[entitlements.status].toLowerCase()})`}.{' '}
            <Link href="/account/subscription" className="font-medium text-signal hover:text-signal-hover">
              Manage your subscription
            </Link>
          </p>
        </div>
      )}

      {plans.length === 0 ? (
        <EmptyState title="No plans yet" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const priced = plan.priceCents !== null
            // Two separate reasons a plan cannot be bought, and they are
            // genuinely different: nobody has decided the price, or the
            // price exists but there is no way to take the money.
            const reason = !priced
              ? 'The price for this plan has not been decided yet.'
              : !plan.stripePriceId
                ? 'This plan is not connected to a payment provider yet.'
                : !checkoutReady
                  ? 'No payment provider is connected yet.'
                  : entitlements.subscribed
                    ? 'You already have an active subscription.'
                    : null

            const canSubscribe =
              priced &&
              plan.stripePriceId &&
              checkoutReady &&
              !entitlements.subscribed &&
              tradeAccount &&
              Boolean(session)

            const showSignIn =
              priced &&
              Boolean(plan.stripePriceId) &&
              checkoutReady &&
              !entitlements.subscribed &&
              !session

            const blockedReason =
              session && !tradeAccount
                ? 'Customer accounts do not need a trade subscription.'
                : reason

            return (
              <div key={plan.id} className="flex flex-col rounded-md border border-line bg-paper p-6">
                <p className="font-medium text-graphite">{plan.name}</p>

                <p className="mt-4 text-3xl font-semibold tracking-tight text-graphite">
                  {priced ? (
                    <>
                      {formatMoney(plan.priceCents!, plan.currency)}
                      <span className="ml-1.5 text-sm font-normal text-zinc-deep">
                        {INTERVAL_SUFFIX[plan.interval]}
                      </span>
                    </>
                  ) : (
                    <span className="text-lg font-normal text-zinc-deep">Pricing not set</span>
                  )}
                </p>

                {plan.description && <p className="mt-3 text-sm text-graphite-soft">{plan.description}</p>}

                {plan.trialDays ? (
                  <p className="mt-2 text-sm text-zinc-deep">{plan.trialDays}-day trial.</p>
                ) : null}

                <div className="mt-6 flex-1" />

                <PlansSubscribePanel
                  planId={plan.id}
                  canSubscribe={Boolean(canSubscribe)}
                  reason={blockedReason}
                  showSignIn={Boolean(showSignIn)}
                />
              </div>
            )
          })}
        </div>
      )}

      <section className="mt-12 max-w-prose">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">
          What the trade subscription covers
        </h2>
        <ul className="mt-3 grid gap-2 text-graphite-soft sm:grid-cols-2">
          {['Quote on the job board', 'Trade profile', 'Trade listings', 'Inspections and assets', 'Catalogue editing'].map(
            (item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-natural" aria-hidden="true" />
                {item}
              </li>
            ),
          )}
        </ul>
      </section>

      {!checkoutReady && (
        <div className="mt-10 max-w-prose">
          <NotConnected
            feature="Subscribing"
              reason="Payments aren't switched on yet, so plans can't be bought."
          />
        </div>
      )}
    </div>
  )
}
