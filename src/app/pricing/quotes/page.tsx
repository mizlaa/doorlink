import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { describeSpec, parseSpec } from '@/lib/configurator/options'
import { JOB_STATUS_LABELS, JOB_STATUS_TONE } from '@/lib/labels'
import { accessoryLabel } from '@/lib/pricing/accessories'
import { businessKeyFor, quoteBusinessWhere, pricingSession } from '@/lib/pricing/business'
import { productLabel } from '@/lib/pricing/products'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { CustomReplyForm } from './CustomReplyForm'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Quotes & jobs' }

export default async function QuotesIssuedPage() {
  const session = await pricingSession(await getSession())
  if (!session) return null
  // Only this business's own quotes, requests and bookings.
  const quotes = await prisma.automatedQuote.findMany({
    where: quoteBusinessWhere(businessKeyFor(session)),
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      options: { orderBy: { sortOrder: 'asc' }, take: 1 },
      _count: { select: { options: true } },
      job: {
        select: {
          id: true,
          status: true,
          agreedPriceCents: true,
          currency: true,
          transactions: { select: { commissionCents: true, workerPayoutCents: true, status: true } },
        },
      },
    },
    take: 300,
  })

  const requests = quotes.filter((q) => q.status === 'CUSTOM_REQUESTED')
  const jobs = quotes.filter((q) => q.job)
  const issued = quotes.filter((q) => !q.job && q.status !== 'CUSTOM_REQUESTED')

  if (quotes.length === 0) {
    return (
      <EmptyState
        title="No quotes yet"
        description="When a customer in your service area compares quotes and their design matches your prices, it appears here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {requests.length > 0 && (
        <section aria-labelledby="requests-heading">
          <h2 id="requests-heading" className="mb-3 text-sm font-medium text-graphite">
            Custom quote requests <Badge tone="caution">{requests.length}</Badge>
          </h2>
          <ul className="flex flex-col gap-3">
            {requests.map((quote) => {
              let rows: Array<{ label: string; value: string }> = []
              try {
                rows = describeSpec(parseSpec(quote.spec)).slice(0, 8)
              } catch {}
              return (
                <li key={quote.id} className="rounded-lg border border-caution/40 bg-paper p-4">
                  <p className="font-medium text-graphite">
                    {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
                  </p>
                  <p className="text-sm text-zinc-deep">
                    {quote.customer.name.split(' ')[0]} · {quote.postcode} ·{' '}
                    {quote.installRequired ? 'supply and install' : 'supply only'}
                    {quote.accessories.length > 0 && ` · ${quote.accessories.map(accessoryLabel).join(', ')}`}
                  </p>
                  {rows.length > 0 && (
                    <p className="mt-1 text-sm text-graphite-soft">{rows.map((r) => `${r.label}: ${r.value}`).join(' · ')}</p>
                  )}
                  {quote.customMessage && (
                    <p className="mt-2 rounded-md bg-rail px-3 py-2 text-sm text-graphite">“{quote.customMessage}”</p>
                  )}
                  <CustomReplyForm quoteId={quote.id} />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {jobs.length > 0 && (
        <section aria-labelledby="jobs-heading">
          <h2 id="jobs-heading" className="mb-3 text-sm font-medium text-graphite">
            Bookings
          </h2>
          <ul className="flex flex-col gap-2">
            {jobs.map((quote) => {
              const paidPayout = quote.job!.transactions
                .filter((t) => t.status === 'PAID')
                .reduce((sum, t) => sum + t.workerPayoutCents, 0)
              return (
                <li key={quote.id}>
                  <Link
                    href={`/jobs/${quote.job!.id}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4 hover:border-signal"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-graphite">
                        {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
                        <Badge tone={JOB_STATUS_TONE[quote.job!.status]}>{JOB_STATUS_LABELS[quote.job!.status]}</Badge>
                      </span>
                      <span className="block text-sm text-zinc-deep">
                        {quote.customer.name.split(' ')[0]} · {quote.createdAt.toLocaleDateString('en-AU')}
                      </span>
                    </span>
                    <span className="text-right font-semibold text-graphite">
                      {formatMoney(quote.job!.agreedPriceCents ?? 0, quote.job!.currency)}
                      {paidPayout > 0 && (
                        <span className="block text-micro font-normal text-zinc-deep">
                          Paid to you so far {formatMoney(paidPayout, quote.job!.currency)} before card fees
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {issued.length > 0 && (
        <section aria-labelledby="issued-heading">
          <h2 id="issued-heading" className="mb-3 text-sm font-medium text-graphite">
            Quotes issued
          </h2>
          <ul className="flex flex-col gap-2">
            {issued.map((quote) => (
              <li key={quote.id} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium text-graphite">
                    {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
                    {quote.status === 'DECLINED' && <Badge>Declined</Badge>}
                  </span>
                  <span className="block text-sm text-zinc-deep">
                    {quote.customer.name.split(' ')[0]} · {quote.postcode ?? ''} · {quote.createdAt.toLocaleDateString('en-AU')} ·{' '}
                    <span className="font-code">{quote.reference}</span>
                  </span>
                </span>
                {quote.options[0] && (
                  <span className="text-right font-semibold text-graphite">
                    {formatMoney(quote.options[0].totalIncGstCents, quote.options[0].currency)}
                    <span className="block text-micro font-normal text-zinc-deep">
                      {quote._count.options > 1 ? 'from, inc GST' : 'inc GST'}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
