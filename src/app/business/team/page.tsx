import type { Metadata } from 'next'
import { assignableTechnicians } from '@/lib/business/access'
import { businessPage } from '@/lib/business/guard'
import { prisma } from '@/lib/prisma'
import { businessUserIds } from '@/lib/pricing/business'
import { formatInZone, localDateString } from '@/lib/timezone'
import { Card, PageHeader, Pill, SectionTitle } from '@/components/business/ui'
import { InviteForm, MemberControls, RemoveTimeOff, TimeOffForm } from './TeamForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Team' }

export default async function TeamPage() {
  const gate = await businessPage('OWNER', '/business/team')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const now = new Date()
  const [ownerIds, members, people, timeOff, workload] = await Promise.all([
    businessUserIds(business.key),
    prisma.businessMember.findMany({ where: { businessId: business.businessId, status: { not: 'REMOVED' } }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
    assignableTechnicians(business),
    prisma.technicianTimeOff.findMany({ where: { businessId: business.businessId, endsAt: { gte: now } }, include: { technician: { select: { name: true } } }, orderBy: { startsAt: 'asc' } }),
    prisma.appointment.groupBy({ by: ['technicianId'], where: { businessId: business.businessId, status: 'BOOKED', startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } }, _count: { _all: true } }),
  ])
  const owners = await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
  const upcoming = (id: string) => workload.find((w) => w.technicianId === id)?._count._all ?? 0

  return (
    <>
      <PageHeader title="Team" subtitle="Who can be booked for visits, and what each person can see." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle>People</SectionTitle>
            <ul className="divide-y divide-line">
              {owners.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-graphite">{o.name}</span>
                    <span className="block truncate text-micro text-zinc-deep">{o.email} · {upcoming(o.id)} visit{upcoming(o.id) === 1 ? '' : 's'} this week</span>
                  </span>
                  <Pill tone="blue">Owner</Pill>
                </li>
              ))}
              {members.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium text-graphite">
                      {m.user.name}
                      {m.status === 'INVITED' && <Pill tone="amber">Invited</Pill>}
                    </span>
                    <span className="block truncate text-micro text-zinc-deep">{m.user.email} · {upcoming(m.userId)} visit{upcoming(m.userId) === 1 ? '' : 's'} this week</span>
                  </span>
                  <MemberControls id={m.id} role={m.role} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionTitle>Add someone</SectionTitle>
            <InviteForm />
          </Card>
        </div>
        <Card>
          <SectionTitle>Time off</SectionTitle>
          <p className="mb-4 text-sm text-graphite-soft">Nobody can book a visit for someone on their days off.</p>
          <TimeOffForm people={people.map((p) => ({ id: p.id, name: p.name }))} today={localDateString(now, business.timezone)} />
          {timeOff.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {timeOff.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="block font-medium text-graphite">{t.technician.name}</span>
                    <span className="block text-micro text-zinc-deep">
                      {formatInZone(t.startsAt, business.timezone, { day: 'numeric', month: 'short' })} – {formatInZone(new Date(t.endsAt.getTime() - 1), business.timezone, { day: 'numeric', month: 'short' })}
                      {t.reason ? ` · ${t.reason}` : ''}
                    </span>
                  </span>
                  <RemoveTimeOff id={t.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
