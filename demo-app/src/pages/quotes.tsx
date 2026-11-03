import { useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { describeSpec, parseSpec } from '@/lib/configurator/options'
import { formatMoney } from '@/lib/money'
import { accessoryLabel, accessoriesFor } from '@/lib/pricing/accessories'
import { INSTALLATION_LABELS, motorLabel, productForSpec, productLabel, specNeedsMotor, styleLabel } from '@/lib/pricing/products'
import type { QuoteLine } from '@/lib/pricing/engine'
import { CompareForm } from '@/app/quote/CompareForm'
import { CustomQuoteButton } from '@/app/compare/[reference]/CustomQuoteButton'
import { BookingForm } from '@/app/quotes/[reference]/BookingForm'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PrintButton } from '@/components/ui/PrintButton'
import { Stars } from '@/components/quotes/Stars'
import { cn } from '@/lib/utils'
import { useDemo, type AutomatedQuote } from '../demo/store'
import { BRANDS, companyById } from '../demo/data'
import { businessCard, portfolioFor, reviewsFor, type DemoCard } from '../demo/cards'
import { DemoTag, SignInPrompt, Stars as ReviewStars } from './shared'
import { NotFoundPage } from './NotFound'

/* ------------------------------------------------------------------ */
/* /quote: "Compare free quotes" (src/app/quote/page.tsx)              */
/* ------------------------------------------------------------------ */

export function QuotePage() {
  const params = useSearchParams()
  const session = useDemo((s) => s.session)
  const comparisons = useDemo((s) => s.comparisons)
  const raw = params.get('spec')
  const spec = useMemo(() => {
    try {
      return raw ? parseSpec(JSON.parse(raw)) : null
    } catch {
      return null
    }
  }, [raw])
  if (!spec) {
    return (
      <div className="mx-auto max-w-shell px-4 py-16">
        <EmptyState
          title="Start with a design"
          description="Quotes are priced on a design. Pick a style and size first."
          action={
            <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
              Open the designer
            </Link>
          }
        />
      </div>
    )
  }
  const encoded = JSON.stringify(spec)
  const { product } = productForSpec(spec)
  const mode = !session ? 'signed-out' : session.role === 'CUSTOMER' ? 'customer' : 'business'
  const last = session ? comparisons.find((c) => c.customerId === session.userId) : null
  const defaults = last ? { postcode: last.postcode, suburb: last.suburb ?? '' } : { postcode: '', suburb: '' }
  const accessories = accessoriesFor(product, specNeedsMotor(spec)).map((a) => ({ id: a.id, label: a.label }))
  const rows = describeSpec(spec)
  const here = `/quote?spec=${encodeURIComponent(encoded)}`

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-6 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Compare free quotes</h1>
        <p className="mt-1 text-graphite-soft">
          Every approved business that services your postcode is priced on your design instantly, from its own prices.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-line bg-paper p-4 shadow-panel">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-graphite">{productLabel(product)}</h2>
            <Link href={`/configure?spec=${encodeURIComponent(encoded)}`} className="text-sm font-medium text-signal hover:text-signal-hover">
              Edit design
            </Link>
          </div>
          <dl className="mt-3 flex flex-col gap-1.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-sm">
                <dt className="text-zinc-deep">{row.label}</dt>
                <dd className="text-right text-graphite">{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <section className="min-w-0">
          <CompareForm
            spec={encoded}
            brands={BRANDS}
            accessories={accessories}
            mode={mode}
            defaults={defaults}
            signInHref={`/sign-in?next=${encodeURIComponent(here)}`}
          />
          <p className="mt-4 text-micro text-zinc-deep">
            Demo: try postcode 2170 (Liverpool), 2200 (Bankstown) or 2150 (Parramatta). Every business and price is
            fictional.
          </p>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* /compare/:reference (src/app/compare/[reference]/page.tsx)          */
/* ------------------------------------------------------------------ */

const SORTS = [
  { id: 'price', label: 'Lowest price' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'reviews', label: 'Most reviews' },
  { id: 'soonest', label: 'Soonest install' },
] as const
type SortId = (typeof SORTS)[number]['id']

const UNAVAILABLE_TEXT = {
  'not-offered': 'No automatic price for this product yet.',
  size: 'No automatic price for this size.',
  configuration: 'No automatic price with these options.',
} as const

export function Logo({ card, size = 'md' }: { card: DemoCard; size?: 'md' | 'lg' }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden border border-line font-semibold text-paper',
        size === 'lg' ? 'size-20 rounded-xl text-2xl' : 'size-14 rounded-lg text-lg'
      )}
      style={{ background: card.colour }}
      aria-hidden="true"
    >
      {card.initials}
    </div>
  )
}

export function ComparePage({ params }: { params: Record<string, string> }) {
  const reference = params.reference
  const search = useSearchParams()
  const session = useDemo((s) => s.session)
  const comparisons = useDemo((s) => s.comparisons)
  const allQuotes = useDemo((s) => s.quotes)
  const state = useDemo((s) => s)
  if (!session) return <SignInPrompt next={`/compare/${reference}`} />
  const comparison = comparisons.find((c) => c.reference === reference)
  if (!comparison || (comparison.customerId !== session.userId && session.role !== 'ADMIN')) return <NotFoundPage />

  const sortParam = search.get('sort')
  const sort: SortId = SORTS.some((s) => s.id === sortParam) ? (sortParam as SortId) : 'price'
  const rows = comparison.quoteRefs
    .map((ref) => allQuotes.find((q) => q.reference === ref))
    .filter((q): q is AutomatedQuote => Boolean(q))
    .map((quote) => ({ quote, card: businessCard(quote.companyId, state) }))
  const priced = rows.filter((r) => r.quote.options.length > 0 && r.quote.status !== 'DECLINED')
  const pending = rows.filter((r) => r.quote.status === 'CUSTOM_REQUESTED')
  const requested = new Set(rows.map((r) => r.quote.companyId))
  const unavailable = comparison.unavailable.filter((u) => !requested.has(u.companyId))

  priced.sort((a, b) => {
    const priceA = a.quote.options[0].totalIncGstCents
    const priceB = b.quote.options[0].totalIncGstCents
    if (sort === 'rating') return b.card.ratingAvg - a.card.ratingAvg || priceA - priceB
    if (sort === 'reviews') return b.card.ratingCount - a.card.ratingCount || priceA - priceB
    if (sort === 'soonest') return a.quote.leadTimeDays - b.quote.leadTimeDays || priceA - priceB
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
        <p className="mt-2 flex flex-wrap items-center gap-2 text-micro text-zinc-deep">
          <DemoTag>Indicative demo quotes</DemoTag> Not actual offers. Every business is fictional.
        </p>
      </header>

      {priced.length > 1 && (
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Sort quotes">
          <span className="text-zinc-deep">Sort:</span>
          {SORTS.map((s) => (
            <Link
              key={s.id}
              href={`/compare/${reference}?sort=${s.id}`}
              replace
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
        {priced.map(({ quote, card }, index) => {
          const option = quote.options[0]
          const unpriced = option.unpricedAccessories
          return (
            <li
              key={quote.reference}
              className={cn('rounded-xl border bg-paper p-5 shadow-panel', index === 0 && sort === 'price' ? 'border-signal/50' : 'border-line')}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-4">
                  <Logo card={card} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-graphite">
                      {card.name}
                      {index === 0 && sort === 'price' && priced.length > 1 && <Badge tone="signal">Lowest price</Badge>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Stars average={card.ratingAvg} count={card.ratingCount} />
                      {card.jobsCompleted > 0 && <span className="text-sm text-zinc-deep">{card.jobsCompleted} jobs done</span>}
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
                          Accessories: {quote.accessories.filter((a) => !unpriced.includes(a)).map(accessoryLabel).join(', ') || 'none priced'}
                        </li>
                      )}
                      <li>Warranty: {quote.warranty}</li>
                      <li>Usually installs within {quote.leadTimeDays} days</li>
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
                  {quote.options.length > 1 && <p className="mt-1 text-micro text-zinc-deep">{quote.options.length} options from this business</p>}
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
                  href={`/businesses/${quote.companyId}${from}`}
                  className="inline-flex h-10 items-center rounded-md border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
                >
                  View business
                </Link>
                <Link
                  href={`/businesses/${quote.companyId}${from}#reviews`}
                  className="inline-flex h-10 items-center rounded-md border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
                >
                  View reviews
                </Link>
              </div>
            </li>
          )
        })}
      </ul>

      {(pending.length > 0 || unavailable.length > 0) && (
        <section className="mt-8" aria-labelledby="custom-heading">
          <h2 id="custom-heading" className="mb-3 text-sm font-medium text-graphite">
            Businesses without an automatic price
          </h2>
          <ul className="flex flex-col gap-3">
            {pending.map(({ quote, card }) => (
              <li key={quote.reference} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4">
                <Link href={`/businesses/${quote.companyId}${from}`} className="font-medium text-graphite hover:text-signal">
                  {card.name}
                </Link>
                <Badge tone="caution">Custom quote requested</Badge>
              </li>
            ))}
            {unavailable.map((business) => (
              <li key={business.companyId} className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/businesses/${business.companyId}${from}`} className="font-medium text-graphite hover:text-signal">
                    {business.name}
                  </Link>
                  <p className="text-sm text-zinc-deep">{UNAVAILABLE_TEXT[business.reason]} No price has been estimated.</p>
                </div>
                <CustomQuoteButton comparison={reference} business={business.companyId} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* /quotes (src/app/quotes/page.tsx)                                   */
/* ------------------------------------------------------------------ */

export function MyQuotesPage() {
  const session = useDemo((s) => s.session)
  const all = useDemo((s) => s.quotes)
  if (!session) return <SignInPrompt next="/quotes" />
  const quotes = all.filter((q) => q.customerId === session.userId)
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
            <li key={quote.reference}>
              <Link
                href={`/quotes/${quote.reference}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4 hover:border-signal"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium text-graphite">
                    {quote.businessName}
                    {quote.status === 'BOOKED' && <Badge tone="good">Booked</Badge>}
                    {quote.status === 'CUSTOM_REQUESTED' && <Badge tone="caution">Custom quote requested</Badge>}
                  </span>
                  <span className="block text-sm text-zinc-deep">
                    {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm · {new Date(quote.createdAt).toLocaleDateString('en-AU')}
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

/* ------------------------------------------------------------------ */
/* /quotes/:reference (src/app/quotes/[reference]/page.tsx)            */
/* ------------------------------------------------------------------ */

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? 'border-t border-line pt-2.5' : ''}`}>
      <dt className={strong ? 'font-semibold text-graphite' : 'text-zinc-deep'}>{label}</dt>
      <dd className={strong ? 'text-lg font-semibold text-graphite' : 'text-graphite'}>{value}</dd>
    </div>
  )
}

export function QuoteViewPage({ params }: { params: Record<string, string> }) {
  const reference = params.reference
  const session = useDemo((s) => s.session)
  const quotes = useDemo((s) => s.quotes)
  const state = useDemo((s) => s)
  if (!session) return <SignInPrompt next={`/quotes/${reference}`} />
  const quote = quotes.find((q) => q.reference === reference)
  const company = quote && companyById(quote.companyId)
  const isCustomer = !!quote && quote.customerId === session.userId
  const isBusiness = !!quote && session.companyId === quote.companyId
  if (!quote || !company || (!isCustomer && !isBusiness && session.role !== 'ADMIN')) return <NotFoundPage />
  const spec = parseSpec(quote.spec)
  const rows = describeSpec(spec)
  const card = businessCard(quote.companyId, state)
  const style = styleLabel(quote.productStyle)
  const bookable = quote.status === 'ISSUED' && quote.options.length > 0

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-code text-sm text-zinc-deep">{quote.reference}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">Quote from {quote.businessName}</h1>
          <p className="mt-1 text-sm text-graphite-soft">
            {style ? `${style} ${productLabel(quote.product).toLowerCase()}` : productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm ·{' '}
            {new Date(quote.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Stars average={card.ratingAvg} count={card.ratingCount} />
            <Link href={`/businesses/${quote.companyId}`} className="text-sm font-medium text-signal hover:text-signal-hover">
              View profile
            </Link>
          </div>
        </div>
        <PrintButton />
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-2 text-micro text-zinc-deep">
        <DemoTag>Indicative demo quote</DemoTag> Not an actual offer from a real business.
      </p>

      <section className="mt-6">
        {quote.status === 'CUSTOM_REQUESTED' && (
          <p className="rounded-lg border border-caution/30 bg-caution-tint p-4 text-sm text-graphite">
            You asked {quote.businessName} for a custom quote. You’ll be notified when they reply.
          </p>
        )}
        {quote.options.length > 0 && (
          <h2 className="text-sm font-medium text-graphite">
            {quote.options.length === 1 ? 'Price' : `${quote.options.length} options, lowest first`}
          </h2>
        )}
        <ul className="mt-3 flex flex-col gap-4">
          {quote.options.map((option, index) => (
            <li
              key={option.id}
              className={`rounded-lg border bg-paper p-5 shadow-panel ${quote.acceptedOptionId === option.id ? 'border-good ring-1 ring-good' : 'border-line'}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-graphite">
                  {quote.options.length > 1 && `Option ${index + 1}: `}
                  {option.productBrand ?? 'Brand not named'}
                </p>
                <p className="text-sm text-zinc-deep">
                  {quote.acceptedOptionId === option.id ? <span className="font-semibold text-good">Booked</span> : 'Priced including GST'}
                </p>
              </div>
              <p className="mt-2">
                {option.priceType === 'ESTIMATE' ? (
                  <Badge tone="caution">Estimate · the business confirms the final price after inspecting the site</Badge>
                ) : (
                  <Badge tone="good">Fixed price</Badge>
                )}
              </p>
              <dl className="mt-3">
                {(option.lines as QuoteLine[]).map((line, i) => (
                  <Row
                    key={i}
                    label={line.kind === 'base' ? (option.installation === 'INCLUDED' ? 'Supply and installation' : 'Supply') : line.label}
                    value={`${formatMoney(line.amountCents, option.currency)}${line.gst === 'EXCLUSIVE' ? ' + GST' : ''}`}
                  />
                ))}
                <Row
                  label="Installation"
                  value={option.installation === 'INCLUDED' ? 'Included' : option.installPriceCents !== null ? 'Priced above' : 'Not included'}
                />
                <Row
                  label="Motor"
                  value={option.motorIncluded ? `Included${option.motorBrand ? ` · ${motorLabel(quote.product, option.motorBrand)}` : ''}` : 'Not included'}
                />
                <Row label="Subtotal (ex GST)" value={formatMoney(option.subtotalExGstCents, option.currency)} />
                <Row label="GST (10%)" value={formatMoney(option.gstCents, option.currency)} />
                <Row label="Total (inc GST)" value={formatMoney(option.totalIncGstCents, option.currency)} strong />
              </dl>
              {option.unpricedAccessories.length > 0 && (
                <p className="mt-1 text-sm text-caution">
                  Not priced: {option.unpricedAccessories.map(accessoryLabel).join(', ')}. Ask {quote.businessName} when you book.
                </p>
              )}
              <div className="mt-2 flex flex-col gap-1">
                {option.motorIncluded && !option.motorBrand && (
                  <p className="text-micro text-zinc-deep">The company hasn’t named the motor brand. Ask which model is fitted.</p>
                )}
                {option.note && <p className="text-sm text-graphite-soft">“{option.note}”</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {quote.status === 'BOOKED' ? (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-good/40 bg-natural/10 p-4">
          <p className="text-sm text-graphite">
            <span className="font-semibold">Booked</span>. {isCustomer ? `${quote.businessName} confirms the booking next.` : 'Confirm or decline it from the job.'}
          </p>
          {quote.jobId && (
            <Link href={`/jobs/${quote.jobId}`} className="inline-flex h-10 items-center rounded-md bg-signal px-4 text-sm font-semibold text-paper hover:bg-signal-hover">
              View job
            </Link>
          )}
        </section>
      ) : (
        isCustomer &&
        bookable && (
          <section className="mt-8 rounded-lg border border-line bg-paper p-5 shadow-panel" aria-labelledby="book-heading">
            <h2 id="book-heading" className="text-lg font-semibold text-graphite">
              Choose {quote.businessName}
            </h2>
            <p className="mb-4 mt-1 text-sm text-graphite-soft">
              Free to request. {quote.businessName} gets your address and number and confirms the booking
              {quote.options.some((o) => o.priceType === 'ESTIMATE') ? ' and final price' : ''}. You only pay once you’ve accepted the
              final price and terms.
            </p>
            <BookingForm
              reference={quote.reference}
              businessName={quote.businessName}
              options={quote.options.map((option, index) => ({
                id: option.id,
                label: `${quote.options.length > 1 ? `Option ${index + 1}: ` : ''}${option.productBrand ?? 'Brand not named'}`,
                total: formatMoney(option.totalIncGstCents, option.currency),
              }))}
              defaults={{ name: session.name, phone: '0412 345 678' }}
            />
          </section>
        )
      )}

      <section className="mt-8 rounded-lg border border-line bg-rail p-4">
        <h2 className="text-sm font-medium text-graphite">Design</h2>
        <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
              <dt className="text-zinc-deep">{row.label}</dt>
              <dd className="text-right text-graphite">{row.value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
            <dt className="text-zinc-deep">Asked for</dt>
            <dd className="text-right text-graphite">
              {[quote.requestedBrand ?? 'Any brand', quote.installRequired ? 'Supply and install' : 'Supply only'].join(' · ')}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-6 text-sm text-graphite-soft">
        Warranty: {quote.warranty}. Usually installs within {quote.leadTimeDays} days of booking.
      </p>
      <p className="mt-3 text-micro text-zinc-deep">
        Issued automatically from {quote.businessName}’s own prices for the size and options above. This quote stays as issued even if
        the company changes its prices later.
      </p>

      {isCustomer && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={quote.comparisonRef ? `/compare/${quote.comparisonRef}` : `/quote?spec=${encodeURIComponent(JSON.stringify(spec))}`}
            className="inline-flex h-11 items-center rounded-md border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
          >
            {quote.comparisonRef ? 'Back to all quotes' : 'Compare other companies'}
          </Link>
          <Link href="/quotes" className="inline-flex h-11 items-center px-2 text-sm font-medium text-signal hover:text-signal-hover">
            All my quotes
          </Link>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* /businesses/:id (src/app/businesses/[key]/page.tsx)                 */
/* ------------------------------------------------------------------ */

const SUB_RATINGS = [
  ['workmanship', 'Workmanship'],
  ['communication', 'Communication'],
  ['valueForMoney', 'Value'],
  ['punctuality', 'Punctuality'],
] as const

export function BusinessProfilePage({ params }: { params: Record<string, string> }) {
  const search = useSearchParams()
  const state = useDemo((s) => s)
  const company = companyById(params.id)
  if (!company) return <NotFoundPage />
  const card = businessCard(company.id, state)
  const reviews = reviewsFor(company.id, state)
  const from = search.get('from')
  const backTo = from && /^DL-CMP-[0-9A-Z]{6,12}$/.test(from) ? `/compare/${from}` : null
  const detailAverages = SUB_RATINGS.map(([field, label]) => {
    const values = reviews.map((r) => r[field]).filter((v): v is number => typeof v === 'number')
    return { label, value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
  }).filter((d) => d.value !== null)
  const portfolio = portfolioFor(company.id)

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-10 sm:py-14">
      {backTo && (
        <Link href={backTo} className="mb-4 inline-block text-sm font-medium text-signal hover:text-signal-hover">
          ← Back to your quotes
        </Link>
      )}
      {state.businessStatus[company.id] !== 'APPROVED' && (
        <p className="mb-4 rounded-md border border-caution/30 bg-caution-tint px-3 py-2 text-sm text-graphite">
          Preview: customers can’t see this profile until Doorlink approves it.
        </p>
      )}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Logo card={card} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-graphite">
            {card.name}
            <DemoTag>Fictional business</DemoTag>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Stars average={card.ratingAvg} count={card.ratingCount} />
            <span className="text-sm text-zinc-deep">{card.jobsCompleted} jobs completed on Doorlink</span>
            <span className="text-sm text-zinc-deep">Replies {company.responseTime.toLowerCase()}</span>
          </div>
        </div>
        <Link
          href={backTo ?? '/configure'}
          className="inline-flex h-11 items-center justify-center rounded-md bg-signal px-5 text-sm font-semibold text-paper hover:bg-signal-hover"
        >
          {backTo ? 'Choose from your quotes' : 'Design and get a quote'}
        </Link>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-medium text-graphite">About</h2>
            <p className="whitespace-pre-line text-graphite-soft">{company.description}</p>
          </section>

          <section className="mb-8" aria-labelledby="portfolio-heading">
            <h2 id="portfolio-heading" className="mb-3 text-sm font-medium text-graphite">
              Recent installations
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {portfolio.map((item) => (
                <li key={item.src} className="overflow-hidden rounded-lg border border-line bg-paper">
                  <img src={item.src} alt={item.caption} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <p className="px-2 py-1.5 text-micro text-zinc-deep">{item.caption}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="reviews" aria-labelledby="reviews-heading" className="scroll-mt-24">
            <h2 id="reviews-heading" className="mb-1 text-sm font-medium text-graphite">
              Verified reviews
            </h2>
            <p className="mb-4 text-sm text-zinc-deep">
              Only customers whose job was booked and completed through Doorlink can review. In this demo every review is a sample.
            </p>
            {detailAverages.length > 0 && (
              <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {detailAverages.map((d) => (
                  <div key={d.label} className="rounded-lg border border-line bg-paper p-3">
                    <dt className="text-micro text-zinc-deep">{d.label}</dt>
                    <dd className="text-lg font-semibold text-graphite">{d.value!.toFixed(1)}/5</dd>
                  </div>
                ))}
              </dl>
            )}
            <ul className="flex flex-col gap-3">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-lg border border-line bg-paper p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <ReviewStars value={review.rating} />
                      <Badge tone="caution">Demo review</Badge>
                    </span>
                    <span className="text-micro text-zinc-deep">
                      {review.author} · {review.when} · {productLabel(review.product)}
                    </span>
                  </div>
                  {review.text && <p className="mt-2 whitespace-pre-line text-sm text-graphite">{review.text}</p>}
                  {review.reply && (
                    <div className="mt-3 rounded-md bg-rail px-3 py-2 text-sm">
                      <p className="text-micro font-medium text-zinc-deep">Reply from {card.name}</p>
                      <p className="mt-1 whitespace-pre-line text-graphite">{review.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex h-fit flex-col gap-4 rounded-lg border border-line bg-paper p-4 text-sm shadow-panel">
          <div>
            <h2 className="mb-1 font-medium text-graphite">Products</h2>
            <p className="text-graphite-soft">{company.products.map(productLabel).join(', ')}</p>
          </div>
          <div>
            <h2 className="mb-1 font-medium text-graphite">Services postcodes</h2>
            <p className="text-graphite-soft">{company.coverage.map((a) => `${a.from}–${a.to}`).join(', ')}</p>
          </div>
          <div>
            <h2 className="mb-1 font-medium text-graphite">Warranty</h2>
            <p className="text-graphite-soft">{company.warrantyYears} years on parts and installation</p>
          </div>
          <div>
            <h2 className="mb-1 font-medium text-graphite">Availability</h2>
            <p className="text-graphite-soft">Usually installs within {company.leadTimeDays} days of booking.</p>
          </div>
          <div>
            <h2 className="mb-1 font-medium text-graphite">Based in</h2>
            <p className="text-graphite-soft">{company.suburb}</p>
          </div>
          <div>
            <h2 className="mb-1 font-medium text-graphite">Credentials</h2>
            <p className="text-graphite-soft">Fictional demo business. Licence and insurance are not checked in the demo.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
