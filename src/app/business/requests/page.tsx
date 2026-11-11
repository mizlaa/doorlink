import type { Metadata } from 'next'
import Link from 'next/link'
import { parseSpec } from '@/lib/configurator/options'
import { businessPage } from '@/lib/business/guard'
import { prisma } from '@/lib/prisma'
import { preferredTimesLabel } from '@/lib/requests/measure'
import { formatInZone } from '@/lib/timezone'
import { DesignSummary } from '@/components/designer/DesignSummary'
import { Card, Empty, PageHeader, Pill, SectionTitle } from '@/components/business/ui'
import { RequestButtons } from './RequestButtons'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Requests' }

export default async function RequestsPage() {
  const gate = await businessPage('MANAGER', '/business/requests')
  if (!gate.ok) return gate.screen
  const { business } = gate

  const rows = await prisma.serviceRequestRecipient.findMany({
    where: { businessId: business.businessId },
    include: { request: { include: { job: { select: { id: true, reference: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
  const waiting = rows.filter((r) => r.status === 'PENDING' && r.request.status === 'OPEN')
  const answered = rows.filter((r) => !(r.status === 'PENDING' && r.request.status === 'OPEN'))

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle="Customers asking for an on-site measure. The first company to accept gets the job, with the design and address attached."
      />

      <section className="mb-10">
        <SectionTitle>Waiting for you ({waiting.length})</SectionTitle>
        {waiting.length === 0 ? (
          <Empty title="Nothing waiting">New measure requests from customers in your service area appear here, and you’re emailed when one arrives.</Empty>
        ) : (
          <ul className="flex flex-col gap-4">
            {waiting.map(({ request }) => (
              <li key={request.id}>
                <Card>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-graphite">
                      {request.suburb} {request.state} {request.postcode}
                    </p>
                    <p className="text-micro text-zinc-deep">
                      {request.reference} · received {formatInZone(request.createdAt, business.timezone, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <DesignSummary spec={parseSpec(request.spec)} compact />
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-zinc-deep">Customer</dt>
                      <dd className="text-graphite">{request.contactName.split(' ')[0]}</dd>
                    </div>
                    {preferredTimesLabel(request.preferredTimes) && (
                      <div className="flex gap-2">
                        <dt className="text-zinc-deep">Prefers</dt>
                        <dd className="text-graphite">{preferredTimesLabel(request.preferredTimes)}</dd>
                      </div>
                    )}
                    {request.notes && (
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="shrink-0 text-zinc-deep">Notes</dt>
                        <dd className="text-graphite">{request.notes}</dd>
                      </div>
                    )}
                  </dl>
                  <p className="mt-2 text-micro text-zinc-deep">The street address and phone number are shared when you accept.</p>
                  <RequestButtons requestId={request.id} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {answered.length > 0 && (
        <section>
          <SectionTitle>Answered</SectionTitle>
          <ul className="divide-y divide-line rounded-lg border border-line bg-rail">
            {answered.map(({ id, status, request }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-graphite">
                    {request.suburb} {request.postcode}
                  </span>{' '}
                  <span className="text-zinc-deep">· {request.reference}</span>
                </span>
                <span className="flex items-center gap-3">
                  {status === 'ACCEPTED' && request.job && (
                    <Link href={`/jobs/${request.job.id}`} className="font-medium text-signal hover:text-signal-hover">
                      Job {request.job.reference}
                    </Link>
                  )}
                  <Pill tone={status === 'ACCEPTED' ? 'green' : status === 'DECLINED' ? 'neutral' : 'amber'}>
                    {status === 'ACCEPTED'
                      ? 'You accepted'
                      : status === 'DECLINED'
                        ? 'You passed'
                        : status === 'MISSED'
                          ? 'Taken by another company'
                          : request.status === 'CANCELLED'
                            ? 'Cancelled by customer'
                            : 'Closed'}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
