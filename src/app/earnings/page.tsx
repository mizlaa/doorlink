import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { formatCommissionRate } from '@/lib/commission'
import { productLabel } from '@/lib/pricing/products'
import { workerEarnings } from '@/lib/payments/ledger'
import { paymentsAvailable } from '@/lib/payments'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { TRANSACTION_STATUS_LABELS } from '@/lib/labels'

export const metadata: Metadata = { title: 'Earnings' }

export default async function EarningsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'marketplace:quote')) redirect('/account')

  let earnings
  let transactions
  try {
    ;[earnings, transactions] = await Promise.all([
      workerEarnings(session.userId),
      prisma.transaction.findMany({
        where: { workerId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          job: {
            select: {
              id: true,
              reference: true,
              lead: { select: { title: true } },
              automatedQuote: { select: { product: true, widthMm: true, heightMm: true } },
            },
          },
          payout: { select: { status: true, paidAt: true, amountCents: true } },
        },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Earnings" reason="Can't reach the database right now." />
      </div>
    )
  }

  const live = paymentsAvailable()

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Earnings</h1>
        <p className="mt-1 max-w-prose text-graphite-soft">
          What your completed jobs are worth, what Doorlink took, and what has actually been paid out.
        </p>
      </header>

      {!live && (
        <div className="mb-8">
          <NotConnected
            feature="Payouts"
            reason="No payment provider is connected, so none of these amounts have moved. They are the agreed splits on your jobs, recorded so both sides have the same numbers. Settle with each customer directly for now."
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Paid out to you"
          value={formatMoney(earnings.paidOutCents)}
          detail={`${earnings.paidOutCount} ${earnings.paidOutCount === 1 ? 'payout' : 'payouts'}`}
        />
        <Figure
          label="Owed to you"
          value={formatMoney(earnings.scheduledCents)}
          detail={
            earnings.scheduledCount === 0 ? 'Nothing waiting' : `${earnings.scheduledCount} awaiting transfer`
          }
        />
        <Figure
          label="Not yet paid by the customer"
          value={formatMoney(earnings.awaitingPaymentCents)}
          detail={`${earnings.awaitingPaymentCount} ${earnings.awaitingPaymentCount === 1 ? 'job' : 'jobs'} of ${formatMoney(earnings.awaitingPaymentGrossCents)}`}
        />
        <Figure
          label="Doorlink commission"
          value={formatMoney(earnings.commissionPaidCents)}
          detail={
            earnings.grossEarnedCents > 0
              ? `on ${formatMoney(earnings.grossEarnedCents)} of paid work`
              : 'Nothing paid yet'
          }
        />
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
          Transaction history
        </h2>

        {transactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="A transaction is created the moment a customer accepts one of your quotes."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {transactions.map((transaction) => (
              <li key={transaction.id} className="rounded-md border border-line bg-paper px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="font-medium text-graphite">
                      {transaction.job ? (
                        <Link
                          href={`/jobs/${transaction.job.id}`}
                          className="text-signal hover:text-signal-hover"
                        >
                          {transaction.job.lead?.title ??
                            (transaction.job.automatedQuote
                              ? `${productLabel(transaction.job.automatedQuote.product)} · ${transaction.job.automatedQuote.widthMm} × ${transaction.job.automatedQuote.heightMm} mm`
                              : transaction.job.reference)}
                        </Link>
                      ) : (
                        'Transaction'
                      )}
                    </p>
                    <p className="mt-0.5 font-code text-micro text-zinc-deep">
                      {transaction.reference}
                      {' · '}
                      {transaction.createdAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                    </p>
                  </div>
                  <Badge
                    tone={
                      transaction.status === 'PAID'
                        ? 'good'
                        : transaction.status === 'FAILED'
                          ? 'bad'
                          : 'caution'
                    }
                  >
                    {TRANSACTION_STATUS_LABELS[transaction.status]}
                  </Badge>
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                  <Split
                    label="Customer pays"
                    value={formatMoney(transaction.grossCents, transaction.currency)}
                  />
                  <Split
                    label={`Doorlink fee (${formatCommissionRate(transaction.commissionRateBps)})`}
                    value={`−${formatMoney(transaction.commissionCents, transaction.currency)}`}
                  />
                  <Split
                    label="You receive"
                    value={formatMoney(transaction.workerPayoutCents, transaction.currency)}
                    strong
                  />
                  {transaction.refundedCents > 0 && (
                    <Split
                      label="Refunded"
                      value={formatMoney(transaction.refundedCents, transaction.currency)}
                    />
                  )}
                </dl>

                {/* The rate on this row is the one snapshotted when the
                    quote was accepted, not today's. That is why an old
                    job can show a different percentage from a new one. */}
                {transaction.payout && (
                  <p className="mt-2 text-micro text-zinc-deep">
                    Payout {transaction.payout.status.toLowerCase()}
                    {transaction.payout.paidAt &&
                      ` on ${transaction.payout.paidAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Panel>
      <PanelBody>
        <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-graphite">{value}</p>
        <p className="mt-1 text-micro text-zinc-deep">{detail}</p>
      </PanelBody>
    </Panel>
  )
}

function Split({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-micro text-zinc-deep">{label}</dt>
      <dd className={strong ? 'font-medium text-graphite' : 'text-graphite-soft'}>{value}</dd>
    </div>
  )
}
