import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { businessContexts } from '@/lib/business/access'
import { formatAddress } from '@/lib/business/crm'
import { APPOINTMENT_INCLUDE, type AppointmentWithRelations } from '@/lib/appointments'
import { isLive, KIND_LABELS, STATUS_LABELS } from '@/lib/appointments/rules'
import { parseSpec } from '@/lib/configurator/options'
import { mediaUploadsAvailable } from '@/lib/media'
import { prisma } from '@/lib/prisma'
import { dayRange, formatInZone, formatTimeRange, localDateString } from '@/lib/timezone'
import { DesignSummary } from '@/components/designer/DesignSummary'
import { Card, Empty, Pill, SectionTitle } from '@/components/business/ui'
import { VisitProgress } from '@/app/business/calendar/VisitForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Today' }

/**
 * The technician's day. The next visit leads, with the time, the address,
 * a way to ring the customer and the one button for what happens next.
 */
export default async function TodayPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/today')
  const contexts = await businessContexts(session)
  if (contexts.length === 0) {
    return (
      <div className="mx-auto max-w-prose px-4 py-16">
        <h1 className="text-xl font-semibold text-graphite">Today is for technicians</h1>
        <p className="mt-2 text-sm text-graphite-soft">When a business adds you to its team, the visits it books for you appear here.</p>
      </div>
    )
  }

  // Each business has its own zone; "today" is today there.
  const visits: Array<AppointmentWithRelations & { design: unknown }> = []
  const upcoming: AppointmentWithRelations[] = []
  for (const context of contexts) {
    const today = localDateString(new Date(), context.timezone)
    const range = dayRange(today, context.timezone)
    if (!range) continue
    const [todays, later] = await Promise.all([
      prisma.appointment.findMany({
        where: { businessId: context.businessId, technicianId: session.userId, startsAt: { lt: range.end }, endsAt: { gt: range.start }, status: { not: 'CANCELLED' } },
        include: { ...APPOINTMENT_INCLUDE, job: { select: { id: true, reference: true, title: true, status: true, design: { select: { spec: true } } } } },
        orderBy: { startsAt: 'asc' },
      }),
      prisma.appointment.findMany({
        where: { businessId: context.businessId, technicianId: session.userId, startsAt: { gte: range.end }, status: 'BOOKED' },
        include: APPOINTMENT_INCLUDE,
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
    ])
    visits.push(...todays.map((v) => ({ ...v, design: v.job?.design?.spec ?? null })))
    upcoming.push(...later)
  }
  visits.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  upcoming.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  const next = visits.find((v) => isLive(v.status))
  const rest = visits.filter((v) => v.id !== next?.id)
  const done = visits.filter((v) => v.status === 'COMPLETED').length
  const tz = contexts[0].timezone

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-5">
        <p className="text-sm font-medium text-zinc-deep">{formatInZone(new Date(), tz, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Today</h1>
        <p className="mt-1 text-sm text-graphite-soft">
          {visits.length === 0 ? 'No visits booked for you today.' : `${visits.length} visit${visits.length === 1 ? '' : 's'}${done ? `, ${done} done` : ''}.`}
        </p>
      </header>

      {next ? (
        <section aria-labelledby="next-job" className="mb-8">
          <h2 id="next-job" className="mb-2 text-sm font-semibold uppercase tracking-wide text-signal">
            {next.status === 'BOOKED' ? 'Next job' : STATUS_LABELS[next.status]}
          </h2>
          <div className="rounded-xl border-2 border-signal bg-rail p-4 shadow-panel sm:p-5">
            <p className="text-2xl font-semibold tabular-nums text-graphite">{formatTimeRange(next.startsAt, next.endsAt, next.timezone)}</p>
            <p className="mt-1 text-base font-medium text-graphite">{next.title}</p>
            <p className="text-sm text-zinc-deep">{KIND_LABELS[next.kind]}</p>

            {next.property && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(next.property))}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-graphite hover:border-signal"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 shrink-0 text-signal" aria-hidden="true">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
                </svg>
                <span className="min-w-0">
                  <span className="block font-medium">{next.property.addressLine}</span>
                  <span className="block text-sm text-zinc-deep">
                    {next.property.suburb} {next.property.state} {next.property.postcode} · Open in maps
                  </span>
                </span>
              </a>
            )}
            {next.customer && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-graphite">{next.customer.name}</span>
                  <span className="block text-sm text-zinc-deep">Customer</span>
                </span>
                {next.customer.phone && (
                  <a
                    href={`tel:${next.customer.phone.replace(/\s/g, '')}`}
                    className="inline-flex h-11 shrink-0 items-center rounded border border-line bg-rail px-4 text-sm font-semibold text-graphite hover:border-signal"
                  >
                    Call {next.customer.phone}
                  </a>
                )}
              </div>
            )}
            {(next.notes || next.property?.accessNotes) && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-caution-tint px-3.5 py-2.5 text-sm text-graphite">
                {[next.notes, next.property?.accessNotes].filter(Boolean).join('\n')}
              </p>
            )}
            {next.design ? (
              <div className="mt-3">
                <DesignSummary spec={parseSpec(next.design)} compact />
              </div>
            ) : null}

            <div className="mt-4">
              <VisitProgress id={next.id} status={next.status} photosAvailable={mediaUploadsAvailable()} hasJob={!!next.job} />
            </div>
            {next.job && (
              <Link href={`/jobs/${next.job.id}`} className="mt-3 inline-block text-sm font-medium text-signal hover:text-signal-hover">
                Open job {next.job.reference}
              </Link>
            )}
          </div>
        </section>
      ) : (
        visits.length > 0 && (
          <div className="mb-8">
            <Empty title="All done for today">Every visit booked for you today is finished.</Empty>
          </div>
        )
      )}

      {rest.length > 0 && (
        <section className="mb-8">
          <SectionTitle>{next ? 'Also today' : 'Today'}</SectionTitle>
          <ul className="flex flex-col gap-2">
            {rest.map((visit) => (
              <li key={visit.id}>
                <Card className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold tabular-nums text-graphite">{formatTimeRange(visit.startsAt, visit.endsAt, visit.timezone)}</p>
                      <p className="truncate text-sm text-graphite">{visit.title}</p>
                      {visit.property && <p className="truncate text-micro text-zinc-deep">{formatAddress(visit.property)}</p>}
                    </div>
                    <Pill tone={visit.status === 'COMPLETED' ? 'green' : visit.status === 'NO_SHOW' ? 'red' : 'blue'}>{STATUS_LABELS[visit.status]}</Pill>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <SectionTitle>Coming up</SectionTitle>
          <ul className="divide-y divide-line rounded-lg border border-line bg-rail text-sm">
            {upcoming.slice(0, 6).map((visit) => (
              <li key={visit.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-graphite">{visit.title}</span>
                  <span className="block truncate text-micro text-zinc-deep">{visit.property ? `${visit.property.suburb} ${visit.property.postcode}` : KIND_LABELS[visit.kind]}</span>
                </span>
                <span className="shrink-0 text-right text-graphite-soft">
                  {formatInZone(visit.startsAt, visit.timezone, { weekday: 'short', day: 'numeric', month: 'short' })}
                  <span className="block text-micro">{formatInZone(visit.startsAt, visit.timezone, { hour: 'numeric', minute: '2-digit' })}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
