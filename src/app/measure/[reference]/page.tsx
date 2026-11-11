import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { parseSpec } from '@/lib/configurator/options'
import { JOB_STATUS_LABELS } from '@/lib/labels'
import { prisma } from '@/lib/prisma'
import { preferredTimesLabel } from '@/lib/requests/measure'
import { formatInZone, formatTimeRange } from '@/lib/timezone'
import { DesignSummary } from '@/components/designer/DesignSummary'
import { Button } from '@/components/ui/Button'
import { cancelMeasureAction } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Measure request', robots: { index: false } }

/**
 * The customer's view of a measure request: who it went to, who took it,
 * and the visit once it's booked. Only the customer who made it can open it.
 */
export default async function MeasureRequestPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { reference } = await params
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/measure/${reference}`)}`)
  const request = await prisma.serviceRequest.findFirst({
    where: { reference, customerId: session.userId },
    include: {
      recipients: { select: { status: true } },
      job: {
        select: {
          id: true,
          reference: true,
          business: { select: { businessKey: true, timezone: true } },
          status: true,
          appointments: { where: { status: { in: ['BOOKED', 'EN_ROUTE', 'IN_PROGRESS'] } }, orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true, endsAt: true, technician: { select: { name: true } } } },
        },
      },
    },
  })
  if (!request) notFound()
  const sent = (await searchParams).sent === '1'
  const tz = request.job?.business?.timezone ?? 'Australia/Sydney'
  const visit = request.job?.appointments[0]
  const declined = request.recipients.filter((r) => r.status === 'DECLINED').length
  const businessName = request.job?.business ? await nameFor(request.job.business.businessKey) : null

  const status =
    request.status === 'CANCELLED'
      ? { title: 'Cancelled', body: 'You cancelled this request. Nothing more will happen.' }
      : request.status === 'ACCEPTED'
        ? visit
          ? { title: `Visit booked with ${businessName ?? 'your installer'}`, body: `${formatInZone(visit.startsAt, tz, { weekday: 'long', day: 'numeric', month: 'long' })}, ${formatTimeRange(visit.startsAt, visit.endsAt, tz)}${visit.technician ? ` · ${visit.technician.name}` : ''}` }
          : request.job && request.job.status !== 'ACCEPTED'
            ? { title: `${businessName ?? 'Your installer'} is on it`, body: `Your job is ${JOB_STATUS_LABELS[request.job.status].toLowerCase()}. Open it for visits, updates and invoices.` }
            : { title: `${businessName ?? 'An installer'} took your request`, body: 'They’ll contact you to book a time to measure.' }
        : request.recipients.length === 0
          ? { title: 'No local companies yet', body: 'No company on Doorlink covers your postcode yet, so this request wasn’t sent to anyone. You can cancel it and try again later.' }
          : { title: 'Sent', body: `Sent to ${request.recipients.length} local compan${request.recipients.length === 1 ? 'y' : 'ies'}. The first to accept will contact you to book a time.${declined ? ` ${declined} couldn’t take it.` : ''}` }

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">Measure request {request.reference}</p>
      <h1 className="mt-1 text-2xl font-semibold text-graphite">{sent ? 'Request sent' : status.title}</h1>
      <p className="mt-2 text-sm text-graphite-soft">{sent ? `${status.body} It’s free, and you don’t have to go ahead.` : status.body}</p>

      <div className="mt-6 flex flex-col gap-4">
        <DesignSummary spec={parseSpec(request.spec)} />
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 rounded-lg border border-line bg-rail p-4 text-sm">
          <dt className="text-zinc-deep">Address</dt>
          <dd className="text-graphite">
            {request.addressLine}, {request.suburb} {request.state} {request.postcode}
          </dd>
          <dt className="text-zinc-deep">Contact</dt>
          <dd className="text-graphite">
            {request.contactName} · {request.contactPhone}
          </dd>
          {request.preferredTimes && (
            <>
              <dt className="text-zinc-deep">Best times</dt>
              <dd className="text-graphite">
                {preferredTimesLabel(request.preferredTimes)}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {request.job ? (
          <Link href={`/jobs/${request.job.id}`} className="flex h-12 items-center justify-center rounded bg-signal text-sm font-semibold text-paper hover:bg-signal-hover">
            Open job {request.job.reference}
          </Link>
        ) : (
          <Link href="/portal" className="flex h-12 items-center justify-center rounded bg-signal text-sm font-semibold text-paper hover:bg-signal-hover">
            See all my requests
          </Link>
        )}
        {request.status === 'OPEN' && (
          <form action={cancelMeasureAction}>
            <input type="hidden" name="reference" value={request.reference} />
            <Button type="submit" variant="ghost" className="w-full text-bad">
              Cancel this request
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

async function nameFor(businessKey: string): Promise<string | null> {
  const { businessCard, decodeBusinessKey } = await import('@/lib/pricing/business')
  const key = decodeBusinessKey(businessKey)
  return key ? ((await businessCard(key))?.name ?? null) : null
}
