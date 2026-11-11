import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { assignableTechnicians } from '@/lib/business/access'
import { businessPage } from '@/lib/business/guard'
import { formatAddress } from '@/lib/business/crm'
import { APPOINTMENT_INCLUDE } from '@/lib/appointments'
import { isLive, KIND_LABELS, STATUS_LABELS } from '@/lib/appointments/rules'
import { mediaUploadsAvailable } from '@/lib/media'
import { prisma } from '@/lib/prisma'
import { formatInZone, formatTimeRange, localDateString, localTimeString } from '@/lib/timezone'
import { Card, PageHeader, Pill, SectionTitle, type PillTone } from '@/components/business/ui'
import { CancelForm, RescheduleForm, VisitProgress } from '../VisitForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Visit' }

const STATUS_TONE: Record<string, PillTone> = { BOOKED: 'blue', EN_ROUTE: 'amber', IN_PROGRESS: 'amber', COMPLETED: 'green', CANCELLED: 'neutral', NO_SHOW: 'red' }

const EVENT_LABELS: Record<string, string> = {
  BOOKED: 'Booked',
  RESCHEDULED: 'Moved',
  REASSIGNED: 'Technician changed',
  UPDATED: 'Updated',
  CANCELLED: 'Cancelled',
  EN_ROUTE: 'On the way',
  IN_PROGRESS: 'Started',
  COMPLETED: 'Completed',
  NO_SHOW: 'No one home',
  REMINDER: 'Reminder sent',
}

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await businessPage('MANAGER', `/business/calendar/${id}`)
  if (!gate.ok) return gate.screen
  const { business, session } = gate

  const [visit, technicians] = await Promise.all([
    prisma.appointment.findFirst({
      where: { id, businessId: business.businessId },
      include: { ...APPOINTMENT_INCLUDE, events: { orderBy: { createdAt: 'asc' } } },
    }),
    assignableTechnicians(business),
  ])
  if (!visit) notFound()
  const actors = await prisma.user.findMany({ where: { id: { in: visit.events.map((e) => e.actorId).filter((v): v is string => !!v) } }, select: { id: true, name: true } })
  const tz = visit.timezone
  const day = localDateString(visit.startsAt, tz)
  const movable = visit.status === 'BOOKED' || visit.status === 'EN_ROUTE'

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={visit.title}
        back={{ href: `/business/calendar?view=day&date=${day}`, label: 'Calendar' }}
        subtitle={
          <>
            {formatInZone(visit.startsAt, tz, { weekday: 'long', day: 'numeric', month: 'long' })}, {formatTimeRange(visit.startsAt, visit.endsAt, tz)}
          </>
        }
        action={<Pill tone={STATUS_TONE[visit.status]}>{STATUS_LABELS[visit.status]}</Pill>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <Card>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-deep">What</dt>
                <dd className="font-medium text-graphite">{KIND_LABELS[visit.kind]}</dd>
              </div>
              <div>
                <dt className="text-zinc-deep">Technician</dt>
                <dd className="font-medium text-graphite">{visit.technician?.name ?? 'Unassigned'}</dd>
              </div>
              {visit.customer && (
                <div>
                  <dt className="text-zinc-deep">Customer</dt>
                  <dd className="font-medium text-graphite">
                    <Link href={`/business/customers/${visit.customer.id}`} className="text-signal hover:text-signal-hover">
                      {visit.customer.name}
                    </Link>
                    {visit.customer.phone && (
                      <>
                        {' · '}
                        <a href={`tel:${visit.customer.phone.replace(/\s/g, '')}`} className="text-signal hover:text-signal-hover">
                          {visit.customer.phone}
                        </a>
                      </>
                    )}
                  </dd>
                </div>
              )}
              {visit.property && (
                <div>
                  <dt className="text-zinc-deep">Address</dt>
                  <dd className="font-medium text-graphite">{formatAddress(visit.property)}</dd>
                </div>
              )}
              {visit.job && (
                <div>
                  <dt className="text-zinc-deep">Job</dt>
                  <dd>
                    <Link href={`/jobs/${visit.job.id}`} className="font-medium text-signal hover:text-signal-hover">
                      {visit.job.reference}
                    </Link>
                  </dd>
                </div>
              )}
              {visit.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-zinc-deep">Notes</dt>
                  <dd className="whitespace-pre-wrap text-graphite">{visit.notes}</dd>
                </div>
              )}
              {visit.completionNotes && (
                <div className="sm:col-span-2">
                  <dt className="text-zinc-deep">Completed</dt>
                  <dd className="whitespace-pre-wrap text-graphite">{visit.completionNotes}</dd>
                </div>
              )}
              {visit.cancelReason && (
                <div className="sm:col-span-2">
                  <dt className="text-zinc-deep">Cancelled because</dt>
                  <dd className="text-graphite">{visit.cancelReason}</dd>
                </div>
              )}
            </dl>
          </Card>

          {isLive(visit.status) && (
            <Card>
              <SectionTitle>Next step</SectionTitle>
              <VisitProgress id={visit.id} status={visit.status} photosAvailable={mediaUploadsAvailable()} hasJob={!!visit.job} />
            </Card>
          )}

          {movable && (
            <Card>
              <SectionTitle>Move or reassign</SectionTitle>
              <RescheduleForm
                id={visit.id}
                version={visit.version}
                technicians={technicians.map((t) => ({ id: t.id, label: t.id === session.userId ? `${t.name} (you)` : t.name }))}
                defaults={{
                  date: day,
                  time: localTimeString(visit.startsAt, tz),
                  duration: Math.round((visit.endsAt.getTime() - visit.startsAt.getTime()) / 60_000),
                  technicianId: visit.technicianId ?? '',
                  notes: visit.notes ?? '',
                }}
              />
              <div className="mt-4 border-t border-line pt-4">
                <CancelForm id={visit.id} />
              </div>
            </Card>
          )}
        </div>

        <aside>
          <SectionTitle>History</SectionTitle>
          <ol className="flex flex-col gap-3 border-l border-line pl-4 text-sm">
            {visit.events.map((event) => (
              <li key={event.id} className="relative">
                <span aria-hidden="true" className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-signal" />
                <p className="font-medium text-graphite">{EVENT_LABELS[event.type] ?? event.type}</p>
                {event.note && <p className="text-graphite-soft">{event.note}</p>}
                <p className="text-micro text-zinc-deep">
                  {formatInZone(event.createdAt, tz, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {event.actorId ? ` · ${actors.find((a) => a.id === event.actorId)?.name ?? 'Someone'}` : ' · Doorlink'}
                </p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
}
