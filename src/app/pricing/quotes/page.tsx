import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { businessKeyFor, quoteBusinessWhere, pricingSession } from '@/lib/pricing/business'
import { productLabel } from '@/lib/pricing/products'
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
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      options: { orderBy: { sortOrder: 'asc' }, take: 1 },
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
            href={`/quotes/${quote.reference}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4 hover:border-signal"
          >
            <span className="min-w-0">
              <span className="block font-medium text-graphite">
                {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
              </span>
              <span className="block text-sm text-zinc-deep">
                {quote.customer.name.split(' ')[0]} · {quote.createdAt.toLocaleDateString('en-AU')} ·{' '}
                <span className="font-code">{quote.reference}</span>
              </span>
            </span>
            {quote.options[0] && (
              <span className="text-right font-semibold text-graphite">
                {formatMoney(quote.options[0].totalIncGstCents, quote.options[0].currency)}
                <span className="block text-micro font-normal text-zinc-deep">inc GST</span>
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
