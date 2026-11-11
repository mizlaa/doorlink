import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { QuoteStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatBudgetRange, formatMoney } from '@/lib/money'
import { isQuotable } from '@/lib/marketplace'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { SpecList } from '@/components/ui/Table'
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONE,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONE,
  URGENCY_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_TONE,
} from '@/lib/labels'
import { AcceptQuoteButton, CancelRequestButton } from './QuoteActions'

export const metadata: Metadata = { title: 'Request' }

type PageProps = { params: Promise<{ id: string }> }

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/sign-in')

  let lead
  try {
    lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        serviceCategory: { select: { name: true } },
        model: { select: { id: true, name: true, modelCode: true } },
        jobs: { select: { id: true, reference: true } },
        quotes: {
          orderBy: { amountCents: 'asc' },
          include: {
            worker: {
              select: {
                id: true,
                name: true,
                technicianProfile: {
                  select: {
                    businessName: true,
                    headline: true,
                    ratingAvg: true,
                    ratingCount: true,
                    jobsCompleted: true,
                    yearsExperience: true,
                    verificationStatus: true,
                    baseSuburb: true,
                    baseState: true,
                  },
                },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Your request" reason="Can't reach the database right now." />
      </div>
    )
  }

  // Not-found rather than forbidden — someone else's request should be
  // indistinguishable from one that doesn't exist.
  if (!lead || lead.customerId !== session.userId) notFound()

  const job = lead.jobs[0]
  const openForQuotes = isQuotable(lead.status)
  const location = [lead.suburb, lead.state, lead.postcode].filter(Boolean).join(' ')

  const details: Array<{ label: string; value: string }> = [
    { label: 'Reference', value: lead.reference },
    { label: 'Status', value: LEAD_STATUS_LABELS[lead.status] },
    { label: 'Urgency', value: URGENCY_LABELS[lead.urgency] },
  ]
  if (lead.serviceCategory) details.push({ label: 'Service', value: lead.serviceCategory.name })
  if (location) details.push({ label: 'Location', value: location })
  if (lead.preferredTiming) details.push({ label: 'Preferred times', value: lead.preferredTiming })
  if (lead.model) details.push({ label: 'Product', value: `${lead.model.modelCode} | ${lead.model.name}` })
  const budget = formatBudgetRange(lead.budgetMinCents, lead.budgetMaxCents)
  if (budget) details.push({ label: 'Budget', value: budget })

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <nav className="mb-6 text-sm">
        <Link href="/my-requests" className="font-medium text-signal hover:text-signal-hover">
          Your requests
        </Link>
      </nav>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-graphite">
              {lead.title ?? 'Your request'}
            </h1>
            <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
          </div>

          <p className="mt-4 whitespace-pre-wrap text-graphite-soft">{lead.message}</p>

          {job && (
            <div className="mt-6 rounded-md border border-good/30 bg-good/5 p-4">
              <p className="text-micro font-semibold uppercase tracking-wide text-good">Job created</p>
              <p className="mt-1 text-sm text-graphite">
                You hired a technician for this request.{' '}
                <Link href={`/jobs/${job.id}`} className="font-medium text-signal hover:text-signal-hover">
                  Track job {job.reference}
                </Link>
              </p>
            </div>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
              Quotes ({lead.quotes.length})
            </h2>

            {lead.quotes.length === 0 ? (
              <EmptyState
                title="No quotes yet"
                description="Technicians covering your area will see this request on the job board."
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {lead.quotes.map((quote) => {
                  const profile = quote.worker.technicianProfile
                  const displayName = profile?.businessName || quote.worker.name
                  return (
                    <li key={quote.id} className="rounded-md border border-line bg-paper p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-graphite">
                            <Link
                              href={`/technicians/${quote.worker.id}`}
                              className="text-signal hover:text-signal-hover"
                            >
                              {displayName}
                            </Link>
                          </p>
                          {profile?.headline && (
                            <p className="mt-0.5 text-sm text-zinc-deep">{profile.headline}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {profile && (
                              <Badge tone={VERIFICATION_TONE[profile.verificationStatus]}>
                                {VERIFICATION_LABELS[profile.verificationStatus]}
                              </Badge>
                            )}
                            <Badge tone={QUOTE_STATUS_TONE[quote.status]}>
                              {QUOTE_STATUS_LABELS[quote.status]}
                            </Badge>
                          </div>
                        </div>
                        <p className="shrink-0 text-lg font-semibold text-graphite">
                          {formatMoney(quote.amountCents, quote.currency)}
                        </p>
                      </div>

                      {/* Rating is shown only when it exists. A worker
                          with no reviews shows "no reviews yet" rather
                          than a default or a zero, which would read as a
                          bad score instead of an absent one. */}
                      <p className="mt-3 text-sm text-zinc-deep">
                        {profile?.ratingCount
                          ? `${profile.ratingAvg?.toFixed(1)} ★ from ${profile.ratingCount} ${profile.ratingCount === 1 ? 'review' : 'reviews'}`
                          : 'No reviews yet'}
                        {profile?.jobsCompleted ? ` · ${profile.jobsCompleted} jobs completed` : ''}
                        {profile?.yearsExperience ? ` · ${profile.yearsExperience} years experience` : ''}
                      </p>

                      <p className="mt-3 whitespace-pre-wrap text-sm text-graphite-soft">{quote.message}</p>

                      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-deep">
                        {quote.estimatedDurationMinutes && (
                          <div>
                            <dt className="inline font-medium text-graphite-soft">Estimated time: </dt>
                            <dd className="inline">{quote.estimatedDurationMinutes} min</dd>
                          </div>
                        )}
                        {quote.availableFrom && (
                          <div>
                            <dt className="inline font-medium text-graphite-soft">Available from: </dt>
                            <dd className="inline">
                              {quote.availableFrom.toLocaleDateString('en-AU', {
                                timeZone: 'Australia/Sydney',
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </dd>
                          </div>
                        )}
                      </dl>

                      {quote.status === QuoteStatus.PENDING && openForQuotes && (
                        <div className="mt-4 border-t border-line pt-4">
                          <AcceptQuoteButton quoteId={quote.id} amountLabel={formatMoney(quote.amountCents)} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:w-72 lg:shrink-0">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Details</h2>
          <SpecList items={details} columns={1} />

          {openForQuotes && !job && (
            <div className="mt-6">
              <CancelRequestButton leadId={lead.id} />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
