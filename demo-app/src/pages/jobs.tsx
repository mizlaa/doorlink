import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { formatMoney } from '@/lib/money'
import { formatCommissionRate } from '@/lib/commission'
import { JOB_STATUS_LABELS, JOB_STATUS_TONE } from '@/lib/labels'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { SpecList } from '@/components/ui/Table'
import { JobTransitionControls, ReviewForm, ReviewReplyForm } from '@/app/jobs/[id]/JobControls'
import { AcceptAndPayForm, ConfirmBookingForm, JobUpdateForm, PayBalanceForm } from '@/app/jobs/[id]/FlowForms'
import type { JobStatus as PrismaJobStatus } from '@prisma/client'
import { useDemo, type Job } from '../demo/store'
import { companyById } from '../demo/data'
import { allowedTransitions, actorFor, isReviewable } from '../demo/marketplace'
import { confirmBooking, postUpdate, transition, replyToReview, DEMO_PAYMENT_NOTE } from '../demo/flows'
import { DemoTag, SignInPrompt } from './shared'
import { NotFoundPage } from './NotFound'

const ACTIVE: Job['status'][] = ['REQUESTED', 'ACCEPTED', 'AWAITING_PAYMENT', 'PAYMENT_CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'BUSINESS_COMPLETED']
const COMMISSION_BPS = 800

/* /jobs (src/app/jobs/page.tsx) */
export function JobsPage() {
  const session = useDemo((s) => s.session)
  const all = useDemo((s) => s.jobs)
  if (!session) return <SignInPrompt next="/jobs" />
  const jobs = all.filter((j) => j.customerId === session.userId || (session.companyId && j.companyId === session.companyId) || session.role === 'ADMIN')
  const active = jobs.filter((j) => ACTIVE.includes(j.status))
  const finished = jobs.filter((j) => !ACTIVE.includes(j.status))
  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Jobs</h1>
        <p className="mt-1 text-graphite-soft">Work you&apos;ve hired someone for, and work you&apos;ve been hired to do.</p>
      </header>
      <JobSection title={`Active (${active.length})`} jobs={active} userId={session.userId} emptyLabel="No active jobs" />
      <JobSection title={`Finished (${finished.length})`} jobs={finished} userId={session.userId} emptyLabel="Nothing finished yet" />
      {jobs.length === 0 && (
        <p className="text-sm text-graphite-soft">
          Jobs start from a booked quote.{' '}
          <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
            Design a door and get quotes
          </Link>
          .
        </p>
      )}
    </div>
  )
}

function JobSection({ title, jobs, userId, emptyLabel }: { title: string; jobs: Job[]; userId: string; emptyLabel: string }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">{title}</h2>
      {jobs.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => {
            const asCustomer = job.customerId === userId
            const counterparty = asCustomer ? companyById(job.companyId)?.name ?? 'Business' : job.customerName
            return (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`} className="block rounded-md border border-line bg-paper p-5 transition-colors hover:border-signal">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">{job.description.split('\n')[0].slice(0, 80)}</p>
                      <p className="mt-1 font-code text-micro text-zinc-deep">{job.reference}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-medium text-graphite">{formatMoney(job.agreedPriceCents)}</span>
                      <Badge tone={JOB_STATUS_TONE[job.status as PrismaJobStatus]}>{JOB_STATUS_LABELS[job.status as PrismaJobStatus]}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-zinc-deep">
                    {asCustomer ? 'Company' : 'Customer'}: {counterparty}
                    {job.scheduledAt && ` · scheduled ${new Date(job.scheduledAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function nextTuesdayAt8(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7))
  d.setHours(8, 0, 0, 0)
  return d.toISOString()
}

/** One person can walk the whole flow: the business's next step, on the customer's screen. */
function DemoBusinessPanel({ job }: { job: Job }) {
  const company = companyById(job.companyId)!
  const name = company.name
  let label: string | null = null
  let run: (() => void) | null = null
  if (job.status === 'REQUESTED') {
    label = job.priceType === 'ESTIMATE' ? 'Confirm the booking at the estimated price' : 'Confirm the booking'
    run = () => confirmBooking(job.id, name, null, 'Thanks for booking. We’ll call the day before to confirm a time.')
  } else if (job.status === 'PAYMENT_CONFIRMED' || job.status === 'ACCEPTED') {
    label = 'Book a time (next Tuesday, 8 am)'
    run = () => transition(job.id, 'SCHEDULED', name, { scheduledAt: nextTuesdayAt8() })
  } else if (job.status === 'SCHEDULED') {
    label = 'Start work and post a progress photo'
    run = () => {
      transition(job.id, 'IN_PROGRESS', name)
      postUpdate(job.id, name, 'Old door removed, new tracks and frame fitted. Panels and motor go in this afternoon.', ['./portfolio/progress-1.jpg'])
    }
  } else if (job.status === 'IN_PROGRESS') {
    label = 'Mark the work as finished'
    run = () => {
      postUpdate(job.id, name, 'All done. Door tested, remotes paired, safety beams aligned. Site cleaned up.', ['./portfolio/garage-1.jpg'])
      transition(job.id, 'BUSINESS_COMPLETED', name)
    }
  } else if (job.status === 'COMPLETED' && job.review && !job.review.reply) {
    label = 'Reply to the review'
    run = () => replyToReview(job.id, 'Thanks so much for the review. Enjoy the new door, and call us any time.')
  }
  if (!label || !run) return null
  return (
    <Panel className="mt-6 border-dashed border-caution/40 bg-caution-tint">
      <PanelBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-graphite">
            <DemoTag>Demo</DemoTag> Act as {name}
          </p>
          <p className="mt-1 text-sm text-graphite-soft">
            In the real app the business does this from their own account. Here you can play both sides.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={run}>
          {label}
        </Button>
      </PanelBody>
    </Panel>
  )
}

/* /jobs/:id (src/app/jobs/[id]/page.tsx) */
export function JobPage({ params }: { params: Record<string, string> }) {
  const query = useSearchParams()
  const session = useDemo((s) => s.session)
  const jobs = useDemo((s) => s.jobs)
  const quotes = useDemo((s) => s.quotes)
  if (!session) return <SignInPrompt next={`/jobs/${params.id}`} />
  const job = jobs.find((j) => j.id === params.id)
  if (!job) return <NotFoundPage />
  const actor = actorFor(job, session)
  if (!actor) return <NotFoundPage />
  const company = companyById(job.companyId)!
  const quote = quotes.find((q) => q.reference === job.quoteRef)
  const paid = job.payments.some((p) => p.status === 'PAID')
  const transitions = allowedTransitions(actor, job.status, { paid })
  const upfront = job.payments.find((p) => p.kind !== 'BALANCE')
  const balance = job.payments.find((p) => p.kind === 'BALANCE')
  const balanceDue = !!balance && balance.status !== 'PAID' && (job.status === 'BUSINESS_COMPLETED' || job.status === 'COMPLETED')
  const counterparty =
    actor === 'customer'
      ? { name: company.name, email: `hello@${company.id.replace('_', '')}.example`, phone: company.phone }
      : { name: job.customerName, email: job.customerEmail, phone: quote?.booking?.phone ?? null }
  const counterpartyLabel = actor === 'customer' ? 'Company' : 'Customer'
  const price = formatMoney(job.agreedPriceCents)

  const details: Array<{ label: string; value: string }> = [
    { label: 'Reference', value: job.reference },
    { label: 'Status', value: JOB_STATUS_LABELS[job.status as PrismaJobStatus] },
    { label: 'Agreed price', value: price },
  ]
  if (job.scheduledAt) details.push({ label: 'Scheduled', value: new Date(job.scheduledAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) })
  details.push({ label: 'Site', value: job.site })
  details.push({ label: 'Wanted', value: job.timing })
  if (job.quoteRef) details.push({ label: 'Quote', value: job.quoteRef })

  function NextStep() {
    const box = 'mt-6 rounded-lg border p-5 shadow-panel'
    if (job!.status === 'REQUESTED') {
      return actor === 'customer' ? (
        <div className={`${box} border-line bg-paper`}>
          <p className="font-medium text-graphite">Waiting for {counterparty.name} to confirm</p>
          <p className="mt-1 text-sm text-graphite-soft">
            {job!.priceType === 'ESTIMATE'
              ? 'Your quote is an estimate: they may inspect the site and confirm the final price before you pay.'
              : `Fixed price ${price}. You’ll be asked to accept and pay once they confirm.`}
          </p>
        </div>
      ) : (
        <div className={`${box} border-signal/40 bg-paper`}>
          <p className="mb-3 font-medium text-graphite">New booking request</p>
          <ConfirmBookingForm jobId={job!.id} estimate={job!.priceType === 'ESTIMATE'} quotedPrice={price} />
        </div>
      )
    }
    if (job!.status === 'AWAITING_PAYMENT') {
      const dueNow = upfront ? formatMoney(upfront.grossCents) : price
      const dueLater = balance ? formatMoney(balance.grossCents) : null
      return actor === 'customer' ? (
        <div className={`${box} border-signal/40 bg-paper`}>
          <p className="font-medium text-graphite">Accepted by {counterparty.name}. Final price {price} inc GST</p>
          {job!.businessNote && <p className="mt-2 rounded-md bg-rail px-3 py-2 text-sm text-graphite">“{job!.businessNote}”</p>}
          <dl className="my-3 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-zinc-deep">{dueLater ? 'Deposit now' : 'Due now'}</dt>
              <dd className="font-semibold text-graphite">{dueNow}</dd>
            </div>
            {dueLater && (
              <div className="flex justify-between py-1">
                <dt className="text-zinc-deep">Balance when the work is finished</dt>
                <dd className="text-graphite">{dueLater}</dd>
              </div>
            )}
          </dl>
          <AcceptAndPayForm jobId={job!.id} online demo dueNow={dueNow} dueLater={dueLater} />
        </div>
      ) : (
        <div className={`${box} border-line bg-paper`}>
          <p className="font-medium text-graphite">Waiting for the customer to accept {price} and pay</p>
        </div>
      )
    }
    if (job!.status === 'BUSINESS_COMPLETED' && actor === 'customer') {
      return (
        <div className={`${box} border-signal/40 bg-paper`}>
          <p className="font-medium text-graphite">{counterparty.name} says the work is finished</p>
          <p className="mt-1 text-sm text-graphite-soft">Confirm it’s done{balanceDue ? ' and pay the balance' : ''}, or raise a problem below.</p>
          {balanceDue && (
            <div className="mt-3">
              <PayBalanceForm jobId={job!.id} amount={formatMoney(balance!.grossCents)} />
            </div>
          )}
        </div>
      )
    }
    if (balanceDue && actor === 'customer') {
      return (
        <div className={`${box} border-caution/40 bg-paper`}>
          <p className="mb-3 font-medium text-graphite">Balance due</p>
          <PayBalanceForm jobId={job!.id} amount={formatMoney(balance!.grossCents)} />
        </div>
      )
    }
    if (job!.status === 'DECLINED') {
      return (
        <div className={`${box} border-line bg-rail`}>
          <p className="font-medium text-graphite">Declined{job!.declinedReason ? `: ${job!.declinedReason}` : ''}</p>
          {actor === 'customer' && job!.quoteRef && (
            <Link href={`/quotes/${job!.quoteRef}`} className="mt-1 inline-block text-sm font-medium text-signal hover:text-signal-hover">
              Choose another business
            </Link>
          )}
        </div>
      )
    }
    return null
  }

  const canPostUpdates = actor !== 'customer' && ['ACCEPTED', 'PAYMENT_CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'BUSINESS_COMPLETED'].includes(job.status)

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
              {quote ? `${quote.productStyle ? `${quote.productStyle[0].toUpperCase()}${quote.productStyle.slice(1)} ` : ''}${quote.product === 'GARAGE_DOOR' ? 'garage door' : quote.product.toLowerCase().replace('_', ' ')} · ${quote.widthMm} × ${quote.heightMm} mm` : 'Job'}
            </h1>
            <Badge tone={JOB_STATUS_TONE[job.status as PrismaJobStatus]}>{JOB_STATUS_LABELS[job.status as PrismaJobStatus]}</Badge>
          </div>

          {query.get('booked') === '1' && actor === 'customer' && job.status === 'REQUESTED' && (
            <p className="mt-4 rounded-md border border-good/40 bg-natural/10 px-4 py-3 text-sm text-graphite">
              <span className="font-semibold">Requested.</span> {counterparty.name} has your details and will confirm the booking. Nothing is
              charged until you accept the final price.
            </p>
          )}
          {query.get('paid') === '1' && actor === 'customer' && (
            <p className="mt-4 rounded-md border border-good/40 bg-natural/10 px-4 py-3 text-sm text-graphite">{DEMO_PAYMENT_NOTE}. Thank you.</p>
          )}

          <NextStep />
          {actor === 'customer' && <DemoBusinessPanel job={job} />}

          <p className="mt-4 whitespace-pre-wrap text-graphite-soft">{job.description}</p>
          {job.quoteRef && (
            <Link href={`/quotes/${job.quoteRef}`} className="mt-3 inline-block text-sm font-medium text-signal hover:text-signal-hover">
              View the quote
            </Link>
          )}

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">{counterpartyLabel}</h2>
            <div className="rounded-md border border-line bg-paper p-4">
              <p className="font-medium text-graphite">{counterparty.name}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-graphite-soft">
                {counterparty.email && <span className="font-medium text-signal">{counterparty.email}</span>}
                {counterparty.phone && <span className="font-medium text-signal">{counterparty.phone}</span>}
              </p>
              <div className="mt-3">
                <Link
                  href="/messages"
                  className="inline-flex h-10 items-center justify-center rounded border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
                >
                  Message {counterpartyLabel.toLowerCase()}
                </Link>
              </div>
            </div>
          </section>

          {transitions.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Update this job</h2>
              <JobTransitionControls jobId={job.id} transitions={transitions as PrismaJobStatus[]} current={job.status as PrismaJobStatus} />
            </section>
          )}

          {actor !== 'customer' && job.review && (
            <section className="mt-8 scroll-mt-24" id="review">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Customer review</h2>
              <div className="rounded-md border border-line bg-paper p-4">
                <p className="text-caution" aria-label={`${job.review.rating} out of 5`}>
                  {'★'.repeat(job.review.rating)}
                  <span className="text-line">{'★'.repeat(5 - job.review.rating)}</span>
                </p>
                {job.review.body && <p className="mt-2 whitespace-pre-line text-sm text-graphite">{job.review.body}</p>}
                <ReviewReplyForm reviewId={job.id} existing={job.review.reply} />
              </div>
            </section>
          )}

          {actor === 'customer' && isReviewable(job.status) && (
            <section className="mt-8 scroll-mt-24" id="review">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">{job.review ? 'Your review' : 'Leave a review'}</h2>
              <ReviewForm
                jobId={job.id}
                uploads
                existing={
                  job.review
                    ? {
                        rating: job.review.rating,
                        body: job.review.body,
                        workmanship: job.review.workmanship,
                        communication: job.review.communication,
                        valueForMoney: job.review.valueForMoney,
                        punctuality: job.review.punctuality,
                        recommend: job.review.recommend,
                        photoCount: 0,
                      }
                    : null
                }
              />
              {job.review?.reply && (
                <div className="mt-3 rounded-md bg-rail px-3 py-2 text-sm">
                  <p className="text-micro font-medium text-zinc-deep">Reply from the business</p>
                  <p className="mt-1 whitespace-pre-line text-graphite">{job.review.reply}</p>
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
                  <JobUpdateForm jobId={job.id} uploads />
                </div>
              )}
              <ol className="flex flex-col gap-2">
                {job.updates.map((update) => (
                  <li key={update.id} className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
                    <p className="text-micro text-zinc-deep">
                      {update.authorName} · {new Date(update.at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                    {update.note && <p className="mt-1 whitespace-pre-line text-graphite">{update.note}</p>}
                    {update.photos.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {update.photos.map((photo, i) => (
                          <li key={i}>
                            <img src={photo} alt="Job photo" className="size-24 rounded-md border border-line object-cover" />
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
              {job.events.map((event, i) => (
                <li key={i} className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-graphite">
                      {event.from && event.from !== event.to
                        ? `${JOB_STATUS_LABELS[event.from as PrismaJobStatus]} → ${JOB_STATUS_LABELS[event.to as PrismaJobStatus]}`
                        : JOB_STATUS_LABELS[event.to as PrismaJobStatus]}
                    </span>
                    <span className="text-micro text-zinc-deep">
                      {new Date(event.at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · {event.actorName}
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
          {job.payments.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Payments</h2>
              <ul className="flex flex-col gap-2">
                {job.payments.map((payment) => {
                  const fee = Math.round(((payment.grossCents / 1.1) * COMMISSION_BPS) / 10000)
                  return (
                    <li key={payment.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-graphite">
                          {payment.kind === 'DEPOSIT' ? 'Deposit' : payment.kind === 'BALANCE' ? 'Balance' : 'Payment'}
                        </span>
                        <span className="font-semibold text-graphite">{formatMoney(payment.grossCents)}</span>
                      </div>
                      <p className="mt-0.5 text-micro text-zinc-deep">
                        {payment.status === 'PAID' ? 'Paid (demo, simulated)' : 'Due'}
                      </p>
                      {actor !== 'customer' && (
                        <dl className="mt-2 border-t border-line pt-2 text-micro">
                          <div className="flex justify-between">
                            <dt className="text-graphite-soft">Doorlink fee ({formatCommissionRate(COMMISSION_BPS)} of ex GST)</dt>
                            <dd className="text-graphite">−{formatMoney(fee)}</dd>
                          </div>
                          <div className="flex justify-between font-medium">
                            <dt className="text-graphite">{actor === 'worker' ? 'You receive' : 'Business receives'}</dt>
                            <dd className="text-graphite">{formatMoney(payment.grossCents - fee)}</dd>
                          </div>
                        </dl>
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-micro text-caution">Demo: no card is charged and no money moves.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
