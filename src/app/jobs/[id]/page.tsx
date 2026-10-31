import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { formatCommissionRate } from '@/lib/commission'
import { allowedTransitions, isReviewable, jobActorFor } from '@/lib/marketplace'
import { isConnected } from '@/lib/integrations'
import { NotConnected } from '@/components/ui/NotConnected'
import { Badge } from '@/components/ui/Badge'
import { SpecList } from '@/components/ui/Table'
import { timingLabel } from '@/lib/pricing/booking'
import { productLabel } from '@/lib/pricing/products'
import { JOB_STATUS_LABELS, JOB_STATUS_TONE, TRANSACTION_STATUS_LABELS } from '@/lib/labels'
import { JobTransitionControls, ReviewForm, ReviewReplyForm } from './JobControls'
import { AcceptAndPayForm, ConfirmBookingForm, JobUpdateForm, PayBalanceForm } from './FlowForms'
import { completeOverdueJobs } from '@/lib/jobs/auto-complete'
import { connectConfigured } from '@/lib/payments/connect'
import { jobHasOnlinePayment } from '@/lib/payments/job-payments'
import { mediaUploadsAvailable, mediaUrl } from '@/lib/media'
import { JobStatus } from '@prisma/client'
import { OpenConversationButton } from '@/app/messages/OpenConversation'

export const metadata: Metadata = { title: 'Job' }

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ booked?: string; paid?: string; payment?: string }>
}

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const query = await searchParams
  const booked = query.booked === '1'
  const session = await getSession()
  if (!session) redirect('/sign-in')
  // A finished job whose customer didn't respond in time completes on the next view.
  await completeOverdueJobs({ id }).catch(() => 0)

  let job
  try {
    job = await prisma.job.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            technicianProfile: {
              select: { businessName: true, businessPhone: true, businessEmail: true, headline: true },
            },
          },
        },
        lead: {
          select: {
            id: true,
            title: true,
            reference: true,
            suburb: true,
            state: true,
            postcode: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        quote: { select: { amountCents: true, message: true, currency: true } },
        organization: { select: { name: true, phone: true, email: true } },
        automatedQuote: {
          select: {
            reference: true,
            businessName: true,
            product: true,
            widthMm: true,
            heightMm: true,
            bookingName: true,
            bookingPhone: true,
            bookingAddress: true,
            bookingSuburb: true,
            bookingState: true,
            bookingPostcode: true,
            bookingTiming: true,
          },
        },
        transactions: { orderBy: { createdAt: 'asc' } },
        updates: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
        workerReview: true,
        statusEvents: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { name: true } } },
        },
      },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="This job" reason="Can't reach the database right now." />
      </div>
    )
  }

  if (!job) notFound()

  const actor = jobActorFor(job, session.userId, can(session.role, 'job:write:any'))
  if (!actor) notFound()

  const paid = await jobHasOnlinePayment(job.id)
  const transitions = allowedTransitions(actor, job.status, { paid })
  const upfront = job.transactions.find((t) => t.kind !== 'BALANCE')
  const balance = job.transactions.find((t) => t.kind === 'BALANCE')
  const online = !!upfront?.stripeAccountId && connectConfigured()
  const balanceDue =
    !!balance?.stripeAccountId &&
    balance.status !== 'PAID' &&
    (job.status === JobStatus.BUSINESS_COMPLETED || job.status === JobStatus.COMPLETED)

  // The customer's contact details come from the request they filled in,
  // not their account record: the phone number they want a technician to
  // ring is the one they typed on this job, and an account created years
  // ago may have no phone on it at all.
  // A job booked from an automated quote carries the booking: the site
  // and phone the customer gave, and the company it was booked with.
  const booking = job.automatedQuote
  const counterparty =
    actor === 'customer'
      ? {
          name:
            booking?.businessName ||
            job.organization?.name ||
            job.worker?.technicianProfile?.businessName ||
            job.worker?.name ||
            null,
          email:
            job.organization?.email ||
            job.worker?.technicianProfile?.businessEmail ||
            job.worker?.email ||
            null,
          phone:
            job.organization?.phone ||
            job.worker?.technicianProfile?.businessPhone ||
            job.worker?.phone ||
            null,
        }
      : {
          name: booking?.bookingName || job.lead?.name || job.customer?.name || null,
          email: job.lead?.email || job.customer?.email || null,
          phone: booking?.bookingPhone || job.lead?.phone || job.customer?.phone || null,
        }
  const counterpartyLabel = actor === 'customer' ? (booking ? 'Company' : 'Technician') : 'Customer'

  const details: Array<{ label: string; value: string }> = [
    { label: 'Reference', value: job.reference },
    { label: 'Status', value: JOB_STATUS_LABELS[job.status] },
  ]
  if (job.agreedPriceCents !== null) {
    details.push({ label: 'Agreed price', value: formatMoney(job.agreedPriceCents, job.currency) })
  }
  if (job.scheduledAt) {
    details.push({
      label: 'Scheduled',
      value: job.scheduledAt.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }),
    })
  }
  if (job.completedAt) {
    details.push({
      label: 'Completed',
      value: job.completedAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    })
  }
  const location = booking
    ? [
        booking.bookingAddress,
        [booking.bookingSuburb, booking.bookingState, booking.bookingPostcode].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ')
    : [job.lead?.suburb, job.lead?.state, job.lead?.postcode].filter(Boolean).join(' ')
  if (location) details.push({ label: booking ? 'Site' : 'Location', value: location })
  const timing = timingLabel(booking?.bookingTiming ?? null)
  if (timing) details.push({ label: 'Wanted', value: timing })
  if (booking) details.push({ label: 'Quote', value: booking.reference })

  const price = formatMoney(job.agreedPriceCents ?? 0, job.currency)
  const current = job
  function NextStep() {
    const box = 'mt-6 rounded-lg border p-5 shadow-panel'
    if (current.status === JobStatus.REQUESTED) {
      return actor === 'customer' ? (
        <div className={`${box} border-line bg-paper`}>
          <p className="font-medium text-graphite">Waiting for {counterparty.name ?? 'the business'} to confirm</p>
          <p className="mt-1 text-sm text-graphite-soft">
            {current.priceType === 'ESTIMATE'
              ? 'Your quote is an estimate: they may inspect the site and confirm the final price before you pay.'
              : `Fixed price ${price}. You’ll be asked to accept and pay once they confirm.`}
          </p>
        </div>
      ) : (
        <div className={`${box} border-signal/40 bg-paper`}>
          <p className="mb-3 font-medium text-graphite">New booking request</p>
          <ConfirmBookingForm jobId={current.id} estimate={current.priceType === 'ESTIMATE'} quotedPrice={price} />
        </div>
      )
    }
    if (current.status === JobStatus.AWAITING_PAYMENT) {
      const dueNow = upfront ? formatMoney(upfront.grossCents, current.currency) : price
      const dueLater = balance ? formatMoney(balance.grossCents, current.currency) : null
      return actor === 'customer' ? (
        <div className={`${box} border-signal/40 bg-paper`}>
          <p className="font-medium text-graphite">Accepted by {counterparty.name}. Final price {price} inc GST</p>
          {current.businessNote && <p className="mt-2 rounded-md bg-rail px-3 py-2 text-sm text-graphite">“{current.businessNote}”</p>}
          <dl className="my-3 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-zinc-deep">{dueLater ? 'Deposit now' : 'Due now'}</dt>
              <dd className="font-semibold text-graphite">{online ? dueNow : 'Pay the business directly'}</dd>
            </div>
            {dueLater && online && (
              <div className="flex justify-between py-1">
                <dt className="text-zinc-deep">Balance when the work is finished</dt>
                <dd className="text-graphite">{dueLater}</dd>
              </div>
            )}
          </dl>
          <AcceptAndPayForm jobId={current.id} online={online} dueNow={dueNow} dueLater={online ? dueLater : null} />
        </div>
      ) : (
        <div className={`${box} border-line bg-paper`}>
          <p className="font-medium text-graphite">Waiting for the customer to accept {price}{online ? ' and pay' : ''}</p>
        </div>
      )
    }
    if (current.status === JobStatus.BUSINESS_COMPLETED && actor === 'customer') {
      return (
        <div className={`${box} border-signal/40 bg-paper`}>
          <p className="font-medium text-graphite">{counterparty.name} says the work is finished</p>
          <p className="mt-1 text-sm text-graphite-soft">
            Confirm it’s done{balanceDue ? ' and pay the balance' : ''}, or raise a problem below.
            {current.autoCompleteAt &&
              ` If you do neither, it completes automatically on ${current.autoCompleteAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}.`}
          </p>
          {balanceDue && (
            <div className="mt-3">
              <PayBalanceForm jobId={current.id} amount={formatMoney(balance!.grossCents, current.currency)} />
            </div>
          )}
        </div>
      )
    }
    if (balanceDue && actor === 'customer') {
      return (
        <div className={`${box} border-caution/40 bg-paper`}>
          <p className="mb-3 font-medium text-graphite">Balance due</p>
          <PayBalanceForm jobId={current.id} amount={formatMoney(balance!.grossCents, current.currency)} />
        </div>
      )
    }
    if (current.status === JobStatus.DECLINED) {
      return (
        <div className={`${box} border-line bg-rail`}>
          <p className="font-medium text-graphite">Declined{current.declinedReason ? `: ${current.declinedReason}` : ''}</p>
          {actor === 'customer' && booking && (
            <Link href={`/quotes/${booking.reference}`} className="mt-1 inline-block text-sm font-medium text-signal hover:text-signal-hover">
              Choose another business
            </Link>
          )}
        </div>
      )
    }
    return null
  }
  const canPostUpdates =
    actor !== 'customer' &&
    ([JobStatus.ACCEPTED, JobStatus.PAYMENT_CONFIRMED, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS, JobStatus.BUSINESS_COMPLETED] as JobStatus[]).includes(job.status)

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <nav className="mb-6 text-sm">
        <Link href="/jobs" className="font-medium text-signal hover:text-signal-hover">
          Jobs
        </Link>
      </nav>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-graphite">
              {job.lead?.title ??
                (booking
                  ? `${productLabel(booking.product)} · ${booking.widthMm} × ${booking.heightMm} mm`
                  : 'Job')}
            </h1>
            <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
          </div>

          {booked && actor === 'customer' && job.status === JobStatus.REQUESTED && (
            <p className="mt-4 rounded-md border border-good/40 bg-natural/10 px-4 py-3 text-sm text-graphite">
              <span className="font-semibold">Requested.</span> {counterparty.name} has your details and will
              confirm the booking. Nothing is charged until you accept the final price.
            </p>
          )}
          {query.paid === '1' && actor === 'customer' && (
            <p className="mt-4 rounded-md border border-good/40 bg-natural/10 px-4 py-3 text-sm text-graphite">
              {job.status === JobStatus.AWAITING_PAYMENT
                ? 'Thanks. Stripe is confirming your payment; this page updates once it does.'
                : 'Payment confirmed. Thank you.'}
            </p>
          )}
          {query.payment === 'cancelled' && actor === 'customer' && (
            <p className="mt-4 rounded-md border border-line bg-rail px-4 py-3 text-sm text-graphite">
              Payment cancelled. Nothing was charged.
            </p>
          )}

          <NextStep />

          <p className="mt-4 whitespace-pre-wrap text-graphite-soft">{job.description}</p>

          {booking && (
            <Link
              href={`/quotes/${booking.reference}`}
              className="mt-3 inline-block text-sm font-medium text-signal hover:text-signal-hover"
            >
              View the quote
            </Link>
          )}

          {job.quote?.message && (
            <div className="mt-6 rounded-md border border-line bg-rail p-4">
              <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">
                What the quote covers
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-graphite">{job.quote.message}</p>
            </div>
          )}

          {/* Contact details appear only once a job exists — that is the
              point at which both sides have agreed to work together. */}
          {counterparty.name && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
                {counterpartyLabel}
              </h2>
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="font-medium text-graphite">{counterparty.name}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-graphite-soft">
                  {counterparty.email && (
                    <a
                      href={`mailto:${counterparty.email}`}
                      className="font-medium text-signal hover:text-signal-hover"
                    >
                      {counterparty.email}
                    </a>
                  )}
                  {counterparty.phone && (
                    <a
                      href={`tel:${counterparty.phone.replace(/\s+/g, '')}`}
                      className="font-medium text-signal hover:text-signal-hover"
                    >
                      {counterparty.phone}
                    </a>
                  )}
                </p>
                <div className="mt-3">
                  <OpenConversationButton jobId={job.id} label={`Message ${counterpartyLabel.toLowerCase()}`} />
                </div>
              </div>
            </section>
          )}

          {transitions.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
                Update this job
              </h2>
              <JobTransitionControls jobId={job.id} transitions={transitions} current={job.status} />
            </section>
          )}

          {actor !== 'customer' && job.workerReview && (
            <section className="mt-8 scroll-mt-24" id="review">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Customer review</h2>
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-caution" aria-label={`${job.workerReview.rating} out of 5`}>
                  {'★'.repeat(job.workerReview.rating)}
                  <span className="text-line">{'★'.repeat(5 - job.workerReview.rating)}</span>
                  {job.workerReview.status === 'HIDDEN' && <span className="ml-2 text-sm text-zinc-deep">(hidden by Doorlink)</span>}
                </p>
                {job.workerReview.body && <p className="mt-2 whitespace-pre-line text-sm text-graphite">{job.workerReview.body}</p>}
                <ReviewReplyForm reviewId={job.workerReview.id} existing={job.workerReview.workerReply} />
              </div>
            </section>
          )}

          {actor === 'customer' && isReviewable(job.status) && (
            <section className="mt-8 scroll-mt-24" id="review">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
                {job.workerReview ? 'Your review' : 'Leave a review'}
              </h2>
              <ReviewForm
                jobId={job.id}
                uploads={mediaUploadsAvailable()}
                existing={
                  job.workerReview
                    ? {
                        rating: job.workerReview.rating,
                        body: job.workerReview.body,
                        workmanship: job.workerReview.workmanship,
                        communication: job.workerReview.communication,
                        valueForMoney: job.workerReview.valueForMoney,
                        punctuality: job.workerReview.punctuality,
                        recommend: job.workerReview.recommend,
                        photoCount: job.workerReview.photoKeys.length,
                      }
                    : null
                }
              />
              {job.workerReview?.status === 'HIDDEN' && (
                <p className="mt-2 text-sm text-caution">
                  This review is hidden by Doorlink{job.workerReview.moderationNote ? `: ${job.workerReview.moderationNote}` : '.'}
                </p>
              )}
              {job.workerReview?.workerReply && (
                <div className="mt-3 rounded-md bg-rail px-3 py-2 text-sm">
                  <p className="text-micro font-medium text-zinc-deep">Reply from the business</p>
                  <p className="mt-1 whitespace-pre-line text-graphite">{job.workerReview.workerReply}</p>
                </div>
              )}
            </section>
          )}

          {(job.updates.length > 0 || canPostUpdates) && (
            <section className="mt-8" aria-labelledby="updates-heading">
              <h2 id="updates-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
                Progress
              </h2>
              {canPostUpdates && (
                <div className="mb-4 rounded-md border border-line bg-paper p-4">
                  <JobUpdateForm jobId={job.id} uploads={mediaUploadsAvailable()} />
                </div>
              )}
              <ol className="flex flex-col gap-2">
                {job.updates.map((update) => (
                  <li key={update.id} className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
                    <p className="text-micro text-zinc-deep">
                      {update.author.name} ·{' '}
                      {update.createdAt.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                    {update.note && <p className="mt-1 whitespace-pre-line text-graphite">{update.note}</p>}
                    {update.photoKeys.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {update.photoKeys.map((photo) => (
                          <li key={photo}>
                            <a href={mediaUrl(photo)!} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={mediaUrl(photo)!} alt="Job photo" className="size-24 rounded-md border border-line object-cover" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">History</h2>
            <ol className="flex flex-col gap-2">
              {job.statusEvents.map((event) => (
                <li key={event.id} className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-graphite">
                      {event.fromStatus
                        ? `${JOB_STATUS_LABELS[event.fromStatus]} → ${JOB_STATUS_LABELS[event.toStatus]}`
                        : JOB_STATUS_LABELS[event.toStatus]}
                    </span>
                    <span className="text-micro text-zinc-deep">
                      {event.createdAt.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                      {event.actor && ` · ${event.actor.name}`}
                    </span>
                  </div>
                  {event.note && <p className="mt-1 text-graphite-soft">{event.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="lg:w-72 lg:shrink-0">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Details</h2>
          <SpecList items={details} columns={1} />

          {/* The fee is between Doorlink and the business: it comes out of
              their side and never changes what the customer pays, so the
              customer sees the agreed price and nothing else. */}
          {job.transactions.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Payments</h2>
              <ul className="flex flex-col gap-2">
                {job.transactions.map((payment) => (
                  <li key={payment.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-graphite">
                        {payment.kind === 'DEPOSIT' ? 'Deposit' : payment.kind === 'BALANCE' ? 'Balance' : 'Payment'}
                      </span>
                      <span className="font-semibold text-graphite">{formatMoney(payment.grossCents, payment.currency)}</span>
                    </div>
                    <p className="mt-0.5 text-micro text-zinc-deep">
                      {payment.stripeAccountId ? TRANSACTION_STATUS_LABELS[payment.status] : 'Paid to the business directly'}
                      {payment.refundedCents > 0 && ` · ${formatMoney(payment.refundedCents, payment.currency)} refunded`}
                    </p>
                    {/* The fee is between Doorlink and the business: it comes out of
                        their side and never changes what the customer pays, so the
                        customer sees the price and nothing else. */}
                    {actor !== 'customer' && (
                      <dl className="mt-2 border-t border-line pt-2 text-micro">
                        <div className="flex justify-between">
                          <dt className="text-graphite-soft">Doorlink fee ({formatCommissionRate(payment.commissionRateBps)} of ex GST)</dt>
                          <dd className="text-graphite">−{formatMoney(payment.commissionCents, payment.currency)}</dd>
                        </div>
                        {payment.processingFeeCents !== null && (
                          <div className="flex justify-between">
                            <dt className="text-graphite-soft">Stripe card fee</dt>
                            <dd className="text-graphite">−{formatMoney(payment.processingFeeCents, payment.currency)}</dd>
                          </div>
                        )}
                        <div className="flex justify-between font-medium">
                          <dt className="text-graphite">{actor === 'worker' ? 'You receive' : 'Business receives'}</dt>
                          <dd className="text-graphite">
                            {formatMoney(payment.workerPayoutCents - (payment.processingFeeCents ?? 0), payment.currency)}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
              {!job.transactions.some((t) => t.stripeAccountId) && !isConnected('payments') && actor !== 'customer' && (
                <div className="mt-3">
                  <NotConnected
                    feature="Taking payment"
                    reason="Online payments aren’t connected yet, so the customer pays the business directly. The fee is recorded for settling separately."
                  />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
