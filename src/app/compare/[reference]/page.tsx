import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { formatMoney } from '@/lib/money'
import { accessoryLabel } from '@/lib/pricing/accessories'
import { businessCard, encodeBusinessKey, type BusinessCard } from '@/lib/pricing/business'
import { INSTALLATION_LABELS, motorLabel, productLabel } from '@/lib/pricing/products'
import type { UnavailableBusiness } from '@/lib/pricing/compare'
import { Badge } from '@/components/ui/Badge'
import { Stars } from '@/components/quotes/Stars'
import { cn } from '@/lib/utils'
import { CustomQuoteButton } from './CustomQuoteButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your quotes' }

const SORTS = [
  { id: 'price', label: 'Lowest price' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'reviews', label: 'Most reviews' },
  { id: 'soonest', label: 'Soonest install' },
] as const
type SortId = (typeof SORTS)[number]['id']

const UNAVAILABLE_TEXT: Record<UnavailableBusiness['reason'], string> = {
  'not-offered': 'No automatic price for this product yet.',
  size: 'No automatic price for this size.',
  configuration: 'No automatic price with these options.',
}

function Logo({ card }: { card: BusinessCard }) {
  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-rail text-lg font-semibold text-graphite">
      {card.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.logoUrl} alt="" className="size-full object-contain" />
      ) : (
        card.name.slice(0, 1).toUpperCase()
      )}
    </div>
  )
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const [{ reference }, { sort: sortParam }] = await Promise.all([params, searchParams])
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=/compare/${reference}`)
  if (!/^DL-CMP-[0-9A-Z]{6,12}$/.test(reference)) notFound()

  const comparison = await prisma.quoteComparison.findUnique({
    where: { reference },
    include: { quotes: { include: { options: { orderBy: { sortOrder: 'asc' } } } } },
  })
  // Only the customer who asked (or an admin) can see a comparison.
  if (!comparison || (comparison.customerId !== session.userId && !can(session.role, 'job:write:any'))) notFound()
  const sort: SortId = SORTS.some((s) => s.id === sortParam) ? (sortParam as SortId) : 'price'

  const rows = await Promise.all(
    comparison.quotes.map(async (quote) => {
      const key = quote.businessOrganizationId
        ? ({ kind: 'organization', id: quote.businessOrganizationId } as const)
        : ({ kind: 'user', id: quote.businessUserId! } as const)
      return { quote, card: await businessCard(key), businessKey: encodeBusinessKey(key) }
    })
  )
  const priced = rows.filter((r) => r.card && r.quote.options.length > 0 && r.quote.status !== 'DECLINED')
  const pending = rows.filter((r) => r.card && r.quote.status === 'CUSTOM_REQUESTED')
  const declined = rows.filter((r) => r.card && r.quote.status === 'DECLINED' && r.quote.options.length === 0)
  const requestedKeys = new Set(rows.map((r) => r.businessKey))
  const unavailable = ((comparison.unavailable as unknown as UnavailableBusiness[] | null) ?? []).filter(
    (u) => !requestedKeys.has(u.businessKey)
  )

  priced.sort((a, b) => {
    const priceA = a.quote.options[0].totalIncGstCents
    const priceB = b.quote.options[0].totalIncGstCents
    if (sort === 'rating') return (b.card!.ratingAvg ?? 0) - (a.card!.ratingAvg ?? 0) || priceA - priceB
    if (sort === 'reviews') return b.card!.ratingCount - a.card!.ratingCount || priceA - priceB
    if (sort === 'soonest') return (a.quote.leadTimeDays ?? 999) - (b.quote.leadTimeDays ?? 999) || priceA - priceB
    return priceA - priceB
  })

  const from = `?from=${reference}`

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-6">
        <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Your free quotes</p>
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">
          {productLabel(comparison.product)} · {comparison.widthMm} × {comparison.heightMm} mm
        </h1>
        <p className="mt-1 text-sm text-graphite-soft">
          {comparison.suburb ? `${comparison.suburb} ` : ''}
          {comparison.postcode} · {comparison.installRequired ? 'supply and install' : 'supply only'}
          {comparison.accessories.length > 0 && ` · ${comparison.accessories.map(accessoryLabel).join(', ')}`} ·{' '}
          <Link href={`/configure?spec=${encodeURIComponent(JSON.stringify(comparison.spec))}`} className="font-medium text-signal hover:text-signal-hover">
            Edit design
          </Link>
        </p>
      </header>

      {priced.length > 1 && (
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Sort quotes">
          <span className="text-zinc-deep">Sort:</span>
          {SORTS.map((s) => (
            <Link
              key={s.id}
              href={`/compare/${reference}?sort=${s.id}`}
              scroll={false}
              className={cn(
                'rounded-full border px-3 py-1',
                s.id === sort ? 'border-signal bg-signal text-paper' : 'border-line bg-paper text-graphite hover:border-zinc'
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}

      {priced.length === 0 && pending.length === 0 && unavailable.length === 0 && (
        <div className="rounded-lg border border-line bg-rail p-5 text-sm text-graphite-soft">
          No approved business services {comparison.postcode} for this product yet. You can still{' '}
          <Link href="/request-technician" className="font-medium text-signal hover:text-signal-hover">
            post the job
          </Link>{' '}
          and local technicians will quote.
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {priced.map(({ quote, card, businessKey }, index) => {
          const option = quote.options[0]
          const unpriced = option.unpricedAccessories
          return (
            <li
              key={quote.id}
              className={cn(
                'rounded-xl border bg-paper p-5 shadow-panel',
                index === 0 && sort === 'price' ? 'border-signal/50' : 'border-line'
              )}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-4">
                  <Logo card={card!} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-graphite">
                      {card!.name}
                      {card!.verified && <Badge tone="good">Verified</Badge>}
                      {index === 0 && sort === 'price' && priced.length > 1 && <Badge tone="signal">Lowest price</Badge>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Stars average={card!.ratingAvg} count={card!.ratingCount} />
                      {card!.jobsCompleted > 0 && (
                        <span className="text-sm text-zinc-deep">
                          {card!.jobsCompleted} {card!.jobsCompleted === 1 ? 'job' : 'jobs'} done
                        </span>
                      )}
                    </div>
                    <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm text-graphite-soft sm:grid-cols-2">
                      <li>{INSTALLATION_LABELS[option.installation]}</li>
                      <li>
                        {option.motorIncluded
                          ? `Motor included${option.motorBrand ? `: ${motorLabel(quote.product, option.motorBrand)}` : ''}`
                          : 'No motor'}
                      </li>
                      {option.productBrand && <li>Brand: {option.productBrand}</li>}
                      {quote.accessories.length > 0 && (
                        <li>
                          Accessories:{' '}
                          {quote.accessories.filter((a) => !unpriced.includes(a)).map(accessoryLabel).join(', ') || 'none priced'}
                        </li>
                      )}
                      {quote.warranty && <li>Warranty: {quote.warranty}</li>}
                      {quote.leadTimeDays !== null && <li>Usually installs within {quote.leadTimeDays} days</li>}
                    </ul>
                    {unpriced.length > 0 && (
                      <p className="mt-2 text-sm text-caution">
                        Not priced by this business: {unpriced.map(accessoryLabel).join(', ')}. Ask them when you book.
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 md:text-right">
                  <p className="text-2xl font-semibold text-graphite">{formatMoney(option.totalIncGstCents, option.currency)}</p>
                  <p className="text-sm text-zinc-deep">
                    {formatMoney(option.subtotalExGstCents, option.currency)} + GST {formatMoney(option.gstCents, option.currency)}
                  </p>
                  <p className="mt-1">
                    {option.priceType === 'ESTIMATE' ? (
                      <Badge tone="caution">Estimate · confirmed on inspection</Badge>
                    ) : (
                      <Badge tone="good">Fixed price</Badge>
                    )}
                  </p>
                  {quote.options.length > 1 && (
                    <p className="mt-1 text-micro text-zinc-deep">{quote.options.length} options from this business</p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Link
                  href={`/quotes/${quote.reference}`}
                  className="inline-flex h-10 items-center rounded-md bg-signal px-4 text-sm font-semibold text-paper hover:bg-signal-hover"
                >
                  {quote.status === 'BOOKED' ? 'View booking' : 'Choose business'}
                </Link>
                <Link
                  href={`/businesses/${businessKey}${from}`}
                  className="inline-flex h-10 items-center rounded-md border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
                >
                  View business
                </Link>
                <Link
                  href={`/businesses/${businessKey}${from}#reviews`}
                  className="inline-flex h-10 items-center rounded-md border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
                >
                  View reviews
                </Link>
              </div>
            </li>
          )
        })}
      </ul>

      {(pending.length > 0 || unavailable.length > 0 || declined.length > 0) && (
        <section className="mt-8" aria-labelledby="custom-heading">
          <h2 id="custom-heading" className="mb-3 text-sm font-medium text-graphite">
            Businesses without an automatic price
          </h2>
          <ul className="flex flex-col gap-3">
            {pending.map(({ quote, card, businessKey }) => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4">
                <Link href={`/businesses/${businessKey}${from}`} className="font-medium text-graphite hover:text-signal">
                  {card!.name}
                </Link>
                <Badge tone="caution">Custom quote requested</Badge>
              </li>
            ))}
            {declined.map(({ quote, card }) => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4">
                <span className="font-medium text-graphite">{card!.name}</span>
                <span className="text-sm text-zinc-deep">Can’t quote this one{quote.declinedReason ? `: ${quote.declinedReason}` : '.'}</span>
              </li>
            ))}
            {unavailable.map((business) => (
              <li key={business.businessKey} className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/businesses/${business.businessKey}${from}`} className="font-medium text-graphite hover:text-signal">
                    {business.name}
                  </Link>
                  <p className="text-sm text-zinc-deep">{UNAVAILABLE_TEXT[business.reason]} No price has been estimated.</p>
                </div>
                <CustomQuoteButton comparison={reference} business={business.businessKey} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
