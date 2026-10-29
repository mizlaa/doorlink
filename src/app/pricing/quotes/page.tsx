import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { businessKeyFor, quoteBusinessWhere, pricingSession } from '@/lib/pricing/business'
import { productLabel } from '@/lib/pricing/products'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Quotes issued' }

export default async function QuotesIssuedPage() {
  const session = await pricingSession(await getSession())
  if (!session) return null
  // Only quotes issued from this business's own prices.
  const quotes = await prisma.automatedQuote.findMany({
    where: quoteBusinessWhere(businessKeyFor(session)),
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    include: {
      customer: { select: { name: true } },
      options: { orderBy: { sortOrder: 'asc' }, take: 1 },
      _count: { select: { options: true } },
      job: {
        select: {
          agreedPriceCents: true,
          currency: true,
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { commissionCents: true, workerPayoutCents: true },
          },
        },
      },
    },
    take: 200,
  })

  if (quotes.length === 0) {
    return (
      <EmptyState
        title="No quotes issued yet"
        description="When a customer asks your business for a quote and their design matches one of your prices, it appears here."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {quotes.map((quote) => (
        <li key={quote.id}>
          <Link
            href={quote.jobId ? `/jobs/${quote.jobId}` : `/quotes/${quote.reference}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4 hover:border-signal"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium text-graphite">
                {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
                {quote.status === 'BOOKED' && <Badge tone="good">Booked</Badge>}
              </span>
              <span className="block text-sm text-zinc-deep">
                {quote.customer.name.split(' ')[0]} · {quote.createdAt.toLocaleDateString('en-AU')} ·{' '}
                <span className="font-code">{quote.reference}</span>
              </span>
            </span>
            {quote.job?.agreedPriceCents != null ? (
              // A booking: the price the customer accepted, and what reaches
              // the business after Doorlink's fee.
              <span className="text-right font-semibold text-graphite">
                {formatMoney(quote.job.agreedPriceCents, quote.job.currency)}
                <span className="block text-micro font-normal text-zinc-deep">
                  {quote.job.transactions[0] && quote.job.transactions[0].commissionCents > 0
                    ? `You receive ${formatMoney(quote.job.transactions[0].workerPayoutCents, quote.job.currency)}`
                    : 'inc GST'}
                </span>
              </span>
            ) : (
              quote.options[0] && (
                <span className="text-right font-semibold text-graphite">
                  {formatMoney(quote.options[0].totalIncGstCents, quote.options[0].currency)}
                  <span className="block text-micro font-normal text-zinc-deep">
                    {quote._count.options > 1 ? 'from, inc GST' : 'inc GST'}
                  </span>
                </span>
              )
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
