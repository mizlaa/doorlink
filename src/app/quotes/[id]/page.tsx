import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { categoryInfo } from '@/lib/quoting/catalogue'
import { describeDesign } from '@/lib/quoting/design'
import { breakdownRows, INSTALLATION_LABELS } from '@/lib/quoting/forms'
import { quoteRequestForViewer, type ViewableQuoteRequest } from '@/lib/quoting/quotes'
import { NotConnected } from '@/components/ui/NotConnected'
import { Badge } from '@/components/ui/Badge'
import { PrintButton } from '@/components/ui/PrintButton'

// Per-user and per-business data: always rendered on request, never at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Your quote', robots: { index: false } }

const motorText = (r: ViewableQuoteRequest) =>
  r.motorChoice === 'NONE' ? 'No motor' : r.motorChoice === 'ANY' ? 'Motor, any brand' : `${r.motorBrand} motor`

export default async function QuoteViewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ skipped?: string }> }) {
  const { id } = await params
  const { skipped } = await searchParams
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=/quotes/${id}`)

  let request
  try {
    request = await quoteRequestForViewer(session, id)
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <div className="mx-auto max-w-shell px-4 py-10"><NotConnected feature="Quotes" reason="Can't reach the database right now." /></div>
  }
  // Not the customer and not a quoting company: indistinguishable from a quote that does not exist.
  if (!request) notFound()

  const info = categoryInfo(request.category)
  const spec = [
    { label: 'Product', value: info.label },
    { label: `${info.widthLabel} × ${info.heightLabel.toLowerCase()}`, value: `${request.widthMm.toLocaleString('en-AU')} × ${request.heightMm.toLocaleString('en-AU')} mm` },
    { label: 'Brand asked for', value: request.brand ?? 'No preference' },
    ...(info.motorPolicy === 'none' ? [] : [{ label: 'Motor asked for', value: motorText(request) }]),
    { label: 'Installation', value: request.installationWanted ? 'Wanted' : 'Not wanted' },
    ...describeDesign(request.category, request.design),
  ]
  const quoted = request.quotes.filter((q) => q.status === 'QUOTED')

  return (
    <div className="mx-auto w-full min-w-0 max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-code text-micro text-zinc-deep">{request.reference} · {request.createdAt.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">
            {request.viewer === 'customer' ? `Your ${info.label.toLowerCase()} quotes` : `Quote request for a ${info.label.toLowerCase()}`}
          </h1>
          {request.viewer === 'company' && (
            <p className="mt-1 text-sm text-graphite-soft">
              {request.customer ? `From ${request.customer.name} (${request.customer.email})` : 'The customer did not share their contact details.'} You are seeing your own quote only.
            </p>
          )}
        </div>
        <PrintButton />
      </header>

      {skipped && Number(skipped) > 0 && (
        <p className="mb-6 rounded-md border border-line bg-rail p-3 text-sm text-graphite">
          {skipped === '1' ? 'One company you chose is' : `${skipped} companies you chose are`} no longer taking automated quotes, so they were not asked.
        </p>
      )}

      <section className="mb-10 max-w-2xl">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Specification</h2>
        <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {spec.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-line pb-1.5">
              <dt className="text-sm text-zinc-deep">{row.label}</dt>
              <dd className="text-right text-sm text-graphite">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
          {request.viewer === 'customer' ? `${quoted.length} quote${quoted.length === 1 ? '' : 's'}` : 'Quote'}
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {request.quotes.map((q) => (
            <li key={q.id} className="rounded-md border border-line bg-paper p-5" data-quote-status={q.status}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-graphite">{q.organization.name}</p>
                  {request.viewer === 'customer' && (
                    <Link href={`/companies/${q.organization.id}`} className="text-sm font-medium text-signal hover:text-signal-hover">Company profile</Link>
                  )}
                </div>
                <Badge tone={q.status === 'QUOTED' ? 'good' : 'neutral'}>{q.status === 'QUOTED' ? 'Automated quote' : 'No automated quote'}</Badge>
              </div>
              {q.status === 'QUOTED' && q.totalCents !== null && q.gst && q.basePriceCents !== null && q.exGstCents !== null && q.gstCents !== null ? (
                <>
                  <p className="mt-4 text-3xl font-semibold tracking-tight text-graphite">{formatMoney(q.totalCents, q.currency)}</p>
                  <p className="text-sm text-zinc-deep">including GST</p>
                  <dl className="mt-4 grid gap-y-1">
                    <Row label="Brand" value={q.brand ?? 'Not specified by the company'} />
                    {info.motorPolicy !== 'none' && <Row label="Motor" value={q.motorIncluded ? `Included${q.motorBrand ? `: ${q.motorBrand}` : ' (brand not specified)'}` : 'Not included'} />}
                    <Row
                      label="Installation"
                      value={
                        q.installation === 'INCLUDED'
                          ? request.installationWanted ? 'Included in the price' : 'Included in the price (the company does not price it separately)'
                          : q.installation === 'EXTRA'
                            ? request.installationWanted ? `Included at ${formatMoney(q.installPriceCents ?? 0, q.currency)}` : `Not included (available for ${formatMoney(q.installPriceCents ?? 0, q.currency)})`
                            : INSTALLATION_LABELS.NOT_OFFERED
                      }
                    />
                  </dl>
                  <dl className="mt-4 grid gap-y-1 border-t border-line pt-3">
                    {breakdownRows({ basePriceCents: q.basePriceCents, installPriceCents: q.installPriceCents ?? 0, gst: q.gst, exGstCents: q.exGstCents, gstCents: q.gstCents, totalCents: q.totalCents }).map((r) => (
                      <Row key={r.label} label={r.label} value={r.value} strong={r.total} />
                    ))}
                  </dl>
                  {q.notes && <p className="mt-3 rounded bg-rail p-3 text-sm text-graphite-soft"><span className="font-medium text-graphite">From {q.organization.name}:</span> {q.notes}</p>}
                </>
              ) : (
                <p className="mt-4 text-sm text-graphite-soft">{q.unavailableReason ?? 'No automated quote is available for this configuration.'} No price has been estimated.</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-prose text-micro text-zinc-deep">
          Automated quotes are worked out from each company&apos;s own configured prices for your measurements and choices. Doorlink does not set or check these prices. Confirm details such as site access and final measurements with the company before going ahead.
        </p>
      </section>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? 'text-sm font-semibold text-graphite' : 'text-sm text-zinc-deep'}>{label}</dt>
      <dd className={strong ? 'text-right text-sm font-semibold text-graphite' : 'text-right text-sm text-graphite'}>{value}</dd>
    </div>
  )
}
