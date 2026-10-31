import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { canManageBusiness, ensureBusinessProfile } from '@/lib/business/profile'
import { businessKeyFor, businessUserIds, encodeBusinessKey, pricingSession } from '@/lib/pricing/business'
import { commissionBpsForBusiness } from '@/lib/commission-settings'
import { formatCommissionRate } from '@/lib/commission'
import { connectConfigured } from '@/lib/payments/connect'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { TRANSACTION_STATUS_LABELS } from '@/lib/labels'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { connectStripeAction, refreshStripeAction } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Payments' }

const ERRORS: Record<string, string> = {
  owner: 'Only the business owner can connect a payment account.',
  'not-configured': 'Online payments aren’t switched on for Doorlink yet. Customers pay you directly for now.',
  stripe: 'Stripe couldn’t be reached. Try again in a moment.',
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ error?: string; return?: string }> }) {
  const params = await searchParams
  const session = await pricingSession(await getSession())
  if (!session) return null
  const key = businessKeyFor(session)
  const [profile, manage, feeBps, userIds] = await Promise.all([
    ensureBusinessProfile(key),
    canManageBusiness(session, key),
    commissionBpsForBusiness(encodeBusinessKey(key)),
    businessUserIds(key),
  ])
  const payments = await prisma.transaction.findMany({
    where: { workerId: { in: userIds }, stripeAccountId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { job: { select: { id: true, reference: true } } },
  })

  const live = profile.stripeChargesEnabled
  const section = 'rounded-lg border border-line bg-paper p-5 shadow-panel'

  return (
    <div className="flex flex-col gap-6">
      <section className={section} aria-labelledby="stripe-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-prose">
            <h2 id="stripe-heading" className="flex items-center gap-2 text-sm font-medium text-graphite">
              Online payments
              {live ? <Badge tone="good">On</Badge> : profile.stripeAccountId ? <Badge tone="caution">Setting up</Badge> : <Badge>Off</Badge>}
            </h2>
            <p className="mt-2 text-sm text-graphite-soft">
              Customers pay you through Doorlink by card, into your own Stripe account. Stripe verifies your
              business and bank account and pays out to you. Its card fees come out of each payment, and
              Doorlink’s {formatCommissionRate(feeBps)} fee is taken on the price before GST.
            </p>
            {profile.stripeAccountId && (
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-graphite">
                <li>{profile.stripeDetailsSubmitted ? '✓ Details submitted' : '○ Details not finished'}</li>
                <li>{profile.stripeChargesEnabled ? '✓ Can take payments' : '○ Can’t take payments yet'}</li>
                <li>{profile.stripePayoutsEnabled ? '✓ Payouts on' : '○ Payouts not on yet'}</li>
              </ul>
            )}
            {!live && (
              <p className="mt-3 text-sm text-zinc-deep">
                Until this is on, customers who book you accept your price and pay you directly.
              </p>
            )}
          </div>
          {manage && (
            <div className="flex flex-col items-end gap-2">
              {connectConfigured() ? (
                <form action={connectStripeAction}>
                  <Button type="submit">{profile.stripeAccountId ? (live ? 'Open Stripe setup' : 'Finish Stripe setup') : 'Connect Stripe'}</Button>
                </form>
              ) : (
                <p className="max-w-56 text-right text-sm text-zinc-deep">{ERRORS['not-configured']}</p>
              )}
              {profile.stripeAccountId && connectConfigured() && (
                <form action={refreshStripeAction}>
                  <button type="submit" className="text-sm font-medium text-signal hover:text-signal-hover">
                    Check status
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
        {params.error && ERRORS[params.error] && (
          <p role="alert" className="mt-3 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
            {ERRORS[params.error]}
          </p>
        )}
      </section>

      <section className={section} aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-sm font-medium text-graphite">
          Payments through Doorlink
        </h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-deep">None yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {payments.map((payment) => {
              const net = payment.workerPayoutCents - (payment.processingFeeCents ?? 0) - payment.refundedCents
              return (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    {payment.job ? (
                      <Link href={`/jobs/${payment.job.id}`} className="font-medium text-signal hover:text-signal-hover">
                        {payment.job.reference}
                      </Link>
                    ) : (
                      payment.reference
                    )}{' '}
                    · {payment.kind.toLowerCase()} · <Badge tone={payment.status === 'PAID' ? 'good' : payment.status === 'FAILED' ? 'bad' : 'caution'}>{TRANSACTION_STATUS_LABELS[payment.status]}</Badge>
                  </span>
                  <span className="text-right text-graphite">
                    {formatMoney(payment.grossCents, payment.currency)} − fee {formatMoney(payment.commissionCents, payment.currency)}
                    {payment.processingFeeCents !== null && ` − card ${formatMoney(payment.processingFeeCents, payment.currency)}`}
                    {payment.status === 'PAID' && (
                      <span className="block font-semibold">You receive {formatMoney(net, payment.currency)}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
