import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { productLabel } from '@/lib/pricing/products'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'My quotes', robots: { index: false } }

export default async function MyQuotesPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/quotes')

  // Only quotes issued to this account.
  const quotes = await prisma.automatedQuote.findMany({
    where: { customerId: session.userId },
    orderBy: { createdAt: 'desc' },
    include: { options: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    take: 100,
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-graphite">My quotes</h1>
      {quotes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No quotes yet"
            description="Design a garage door, gate, fence or shutter, then choose a company to get an instant quote."
            action={
              <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
                Start a design
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/quotes/${quote.reference}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4 hover:border-signal"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium text-graphite">
                    {quote.businessName}
                    {quote.status === 'BOOKED' && <Badge tone="good">Booked</Badge>}
                  </span>
                  <span className="block text-sm text-zinc-deep">
                    {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm ·{' '}
                    {quote.createdAt.toLocaleDateString('en-AU')}
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
      )}
    </div>
  )
}
