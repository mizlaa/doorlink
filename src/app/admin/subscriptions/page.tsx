import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { paymentsAvailable } from '@/lib/payments'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels'

export const metadata: Metadata = { title: 'Subscriptions' }

const INTERVAL_SUFFIX = { WEEK: '/week', MONTH: '/month', YEAR: '/year' } as const

export default async function AdminSubscriptionsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  let plans
  let subscriptions
  try {
    ;[plans, subscriptions] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { subscriptions: true } } },
      }),
      prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { name: true, email: true } },
          plan: { select: { name: true } },
        },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Subscriptions" reason="Can't reach the database right now." />
  }

  const live = paymentsAvailable()

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">Plans</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Prices and plan definitions live in the database, so they change without a rebuild. A plan with no
          price is one whose price has not been decided — it is not a number being hidden.
        </p>

        <ul className="mt-5 flex flex-col gap-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-graphite">{plan.name}</span>
                <span className="mt-0.5 block text-micro text-zinc-deep">
                  <span className="font-code">{plan.code}</span>
                  {' · '}
                  {plan._count.subscriptions} {plan._count.subscriptions === 1 ? 'subscriber' : 'subscribers'}
                  {!plan.stripePriceId && ' · no provider price id'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-graphite">
                  {plan.priceCents === null ? (
                    <span className="text-zinc-deep">Pricing not set</span>
                  ) : (
                    <>
                      {formatMoney(plan.priceCents, plan.currency)}
                      <span className="text-zinc-deep">{INTERVAL_SUFFIX[plan.interval]}</span>
                    </>
                  )}
                </span>
                <Badge tone={plan.isActive ? 'good' : 'neutral'}>{plan.isActive ? 'Active' : 'Hidden'}</Badge>
              </span>
            </li>
          ))}
        </ul>

        {!live && (
          <div className="mt-5 max-w-prose">
            <NotConnected
              feature="Selling subscriptions"
              reason="No payment provider is connected, so nobody can subscribe yet and this list will stay empty. Plan definitions, billing states and the feature gate are all built — what is missing is the Stripe keys and a price id on each plan."
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Subscribers ({subscriptions.length})</h2>
        <div className="mt-4">
          {subscriptions.length === 0 ? (
            <EmptyState
              title="Nobody is subscribed"
              description="Which is expected — there is no way to pay yet."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {subscriptions.map((subscription) => (
                <li
                  key={subscription.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-graphite">{subscription.user.name}</span>
                    <span className="mt-0.5 block text-micro text-zinc-deep">
                      {subscription.user.email} · {subscription.plan.name}
                      {subscription.currentPeriodEnd &&
                        ` · ${subscription.cancelAtPeriodEnd ? 'ends' : 'renews'} ${subscription.currentPeriodEnd.toLocaleDateString('en-AU', { dateStyle: 'medium' })}`}
                    </span>
                  </span>
                  <Badge
                    tone={
                      subscription.status === 'ACTIVE' || subscription.status === 'TRIALING'
                        ? 'good'
                        : subscription.status === 'PAST_DUE'
                          ? 'caution'
                          : 'neutral'
                    }
                  >
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
