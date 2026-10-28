import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { categoryInfo } from '@/lib/quoting/catalogue'
import { listOwnQuoteRequests } from '@/lib/quoting/quotes'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'

// Per-user and per-business data: always rendered on request, never at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Your quotes' }

export default async function MyQuotesPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/quotes')
  let requests
  try {
    requests = await listOwnQuoteRequests(session)
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <div className="mx-auto max-w-shell px-4 py-10"><NotConnected feature="Your quotes" reason="Can't reach the database right now." /></div>
  }
  return (
    <div className="mx-auto w-full min-w-0 max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Your quotes</h1>
          <p className="mt-1 text-graphite-soft">Automated quotes from the companies you chose.</p>
        </div>
        <Link href="/quote" className="inline-flex h-11 shrink-0 items-center rounded bg-signal px-5 text-sm font-medium text-paper hover:bg-signal-hover">Get a quote</Link>
      </header>
      {requests.length === 0 ? (
        <EmptyState title="No quotes yet" description="Design a garage door, gate, fence, window shutter or shop shutter and get quotes from participating companies." />
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => {
            const quoted = r.quotes.filter((q) => q.status === 'QUOTED' && q.totalCents !== null)
            const lowest = quoted.length ? Math.min(...quoted.map((q) => q.totalCents!)) : null
            return (
              <li key={r.id}>
                <Link href={`/quotes/${r.id}`} className="block rounded-md border border-line bg-paper p-5 hover:border-signal">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-graphite">{categoryInfo(r.category).label}, {r.widthMm} × {r.heightMm} mm</span>
                    <span className="text-sm text-graphite">{lowest !== null ? `From ${formatMoney(lowest)} inc GST` : 'No automated quotes'}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-deep">
                    {quoted.length} of {r.quotes.length} answer{r.quotes.length === 1 ? '' : 's'} with a price · {[...new Set(r.quotes.map((q) => q.organization.name))].join(', ')}
                  </p>
                  <p className="mt-1 font-code text-micro text-zinc-deep">{r.reference} · {r.createdAt.toLocaleDateString('en-AU')}</p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
