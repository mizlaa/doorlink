import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { describeSpec, parseSpec } from '@/lib/configurator/options'
import { formatMoney } from '@/lib/money'
import { businessCard } from '@/lib/pricing/business'
import { motorLabel, productLabel, styleLabel } from '@/lib/pricing/products'
import { motorCheck, quoteForViewer, type MotorCheck } from '@/lib/pricing/quotes'
import { Stars } from '@/components/quotes/Stars'
import { PrintButton } from '@/components/ui/PrintButton'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Quote', robots: { index: false } }

function MotorNote({ check }: { check: MotorCheck }) {
  switch (check.kind) {
    case 'none':
      return null
    case 'unnamed':
      return (
        <p className="text-micro text-zinc-deep">
          The company hasn’t named the motor brand. Ask which model is fitted.
        </p>
      )
    case 'rated':
      return (
        <p className="text-micro text-good">
          {check.brand} models in Doorlink’s catalogue rated for this size: {check.models.join(', ')}.
        </p>
      )
    case 'not-rated':
      return (
        <p className="text-micro text-caution">
          No {check.brand} motor in Doorlink’s catalogue is rated for this design’s estimated weight. Ask the
          company to confirm the model before you go ahead.
        </p>
      )
    case 'no-data':
      return (
        <p className="text-micro text-zinc-deep">
          No published rating data to check this motor against. The company confirms the model.
        </p>
      )
  }
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? 'border-t border-line pt-2.5' : ''}`}
    >
      <dt className={strong ? 'font-semibold text-graphite' : 'text-zinc-deep'}>{label}</dt>
      <dd className={strong ? 'text-lg font-semibold text-graphite' : 'text-graphite'}>{value}</dd>
    </div>
  )
}

export default async function QuoteViewPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/quotes/${reference}`)}`)

  const quote = await quoteForViewer(reference, session)
  if (!quote) notFound()

  const spec = parseSpec(quote.spec)
  const rows = describeSpec(spec)
  const checks = await Promise.all(quote.options.map((option) => motorCheck(quote, option)))
  const card = await businessCard(
    quote.businessOrganizationId
      ? { kind: 'organization', id: quote.businessOrganizationId }
      : { kind: 'user', id: quote.businessUserId! }
  )
  const isCustomer = quote.customerId === session.userId
  const style = styleLabel(quote.productStyle)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-code text-sm text-zinc-deep">{quote.reference}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">
            Quote from {quote.businessName}
          </h1>
          <p className="mt-1 text-sm text-graphite-soft">
            {[style, productLabel(quote.product)].filter(Boolean).join(' ')} · {quote.widthMm} ×{' '}
            {quote.heightMm} mm ·{' '}
            {quote.createdAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {card && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Stars average={card.ratingAvg} count={card.ratingCount} />
              {card.profileHref && (
                <Link
                  href={card.profileHref}
                  className="text-sm font-medium text-signal hover:text-signal-hover"
                >
                  View profile
                </Link>
              )}
            </div>
          )}
        </div>
        <PrintButton />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-graphite">
          {quote.options.length === 1 ? 'Price' : `${quote.options.length} options, lowest first`}
        </h2>
        <ul className="mt-3 flex flex-col gap-4">
          {quote.options.map((option, index) => (
            <li key={option.id} className="rounded-lg border border-line bg-paper p-5 shadow-panel">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-graphite">
                  {quote.options.length > 1 && `Option ${index + 1}: `}
                  {option.productBrand ?? 'Brand not named'}
                </p>
                <p className="text-sm text-zinc-deep">
                  {option.gst === 'EXCLUSIVE' ? 'Priced plus GST' : 'Priced including GST'}
                </p>
              </div>
              <dl className="mt-3">
                <Row
                  label={option.installation === 'INCLUDED' ? 'Supply and installation' : 'Supply'}
                  value={formatMoney(option.priceCents, option.currency)}
                />
                {option.installPriceCents !== null && (
                  <Row label="Installation" value={formatMoney(option.installPriceCents, option.currency)} />
                )}
                <Row
                  label="Motor"
                  value={
                    option.motorIncluded
                      ? `Included${option.motorBrand ? ` · ${motorLabel(quote.product, option.motorBrand)}` : ''}`
                      : 'Not included'
                  }
                />
                <Row
                  label="Installation terms"
                  value={
                    option.installation === 'INCLUDED'
                      ? 'Included in the price'
                      : option.installPriceCents !== null
                        ? 'Priced separately (added)'
                        : 'Not included (supply only)'
                  }
                />
                <Row
                  label="Subtotal (ex GST)"
                  value={formatMoney(option.subtotalExGstCents, option.currency)}
                />
                <Row label="GST (10%)" value={formatMoney(option.gstCents, option.currency)} />
                <Row
                  label="Total (inc GST)"
                  value={formatMoney(option.totalIncGstCents, option.currency)}
                  strong
                />
              </dl>
              <div className="mt-2 flex flex-col gap-1">
                <MotorNote check={checks[index]} />
                {option.note && <p className="text-sm text-graphite-soft">“{option.note}”</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-line bg-rail p-4">
        <h2 className="text-sm font-medium text-graphite">Design</h2>
        <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm"
            >
              <dt className="text-zinc-deep">{row.label}</dt>
              <dd className="text-right text-graphite">{row.value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
            <dt className="text-zinc-deep">Asked for</dt>
            <dd className="text-right text-graphite">
              {[
                quote.requestedBrand ?? 'Any brand',
                quote.installRequired ? 'Supply and install' : 'Supply only',
              ].join(' · ')}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-6 text-micro text-zinc-deep">
        Issued automatically from {quote.businessName}’s own prices for the size and options above. Prices are
        fixed on this quote even if the company changes its prices later.
      </p>

      {isCustomer && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/quote?spec=${encodeURIComponent(JSON.stringify(spec))}`}
            className="inline-flex h-11 items-center rounded-md border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
          >
            Compare other companies
          </Link>
          <Link
            href="/quotes"
            className="inline-flex h-11 items-center px-2 text-sm font-medium text-signal hover:text-signal-hover"
          >
            All my quotes
          </Link>
        </div>
      )}
    </div>
  )
}
