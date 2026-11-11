import type { Metadata } from 'next'
import Link from 'next/link'
import { KIND_LABELS } from '@/lib/appointments/rules'
import { businessPage } from '@/lib/business/guard'
import { linkBusinessJobs } from '@/lib/business/links'
import { businessOverview } from '@/lib/business/overview'
import { formatMoney } from '@/lib/money'
import { formatTimeRange } from '@/lib/timezone'
import { Card, Empty, PageHeader, PrimaryLink, SecondaryLink, SectionTitle, StatTile } from '@/components/business/ui'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your business' }

/**
 * The owner's first screen: what is waiting on them, most urgent first,
 * with one obvious next step.
 */
export default async function BusinessOverviewPage() {
  const gate = await businessPage('MANAGER', '/business')
  if (!gate.ok) return gate.screen
  const { business } = gate
  await linkBusinessJobs(business)
  const o = await businessOverview(business)

  const next = o.pendingRequests
    ? { href: '/business/requests', label: `Reply to ${o.pendingRequests} request${o.pendingRequests === 1 ? '' : 's'}` }
    : o.newBookings
      ? { href: '/business/jobs?show=new', label: `Confirm ${o.newBookings} booking${o.newBookings === 1 ? '' : 's'}` }
      : o.unscheduledJobs.length
      ? { href: `/business/calendar/new?job=${o.unscheduledJobs[0].id}`, label: 'Book the next visit' }
      : o.overdueCount
        ? { href: '/business/invoices?show=overdue', label: 'Chase overdue invoices' }
        : { href: '/business/calendar', label: 'Open the calendar' }

  return (
    <>
      <PageHeader title={`Hi, ${gate.session.name.split(' ')[0] || 'there'}`} subtitle={business.name} action={<PrimaryLink href={next.href}>{next.label}</PrimaryLink>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          href={o.pendingRequests || !o.newBookings ? '/business/requests' : '/business/jobs?show=new'}
          value={o.pendingRequests + o.newBookings}
          label="Waiting on you"
          tone={o.pendingRequests + o.newBookings ? 'attention' : 'neutral'}
          hint={`${o.pendingRequests} measure request${o.pendingRequests === 1 ? '' : 's'} · ${o.newBookings} booking${o.newBookings === 1 ? '' : 's'} to confirm`}
        />
        <StatTile href="/business/jobs?show=unscheduled" value={o.unscheduledJobs.length} label="Jobs with no visit" tone={o.unscheduledJobs.length ? 'attention' : 'neutral'} hint={o.unassignedVisits ? `${o.unassignedVisits} visit${o.unassignedVisits === 1 ? '' : 's'} with no technician` : 'Every upcoming visit has a technician'} />
        <StatTile href="/business/invoices?show=owing" value={formatMoney(o.owingCents)} label="Outstanding" hint={`${o.owingCount} invoice${o.owingCount === 1 ? '' : 's'}${o.drafts ? ` · ${o.drafts} draft${o.drafts === 1 ? '' : 's'}` : ''}`} />
        <StatTile href="/business/invoices?show=overdue" value={formatMoney(o.overdueCents)} label="Overdue" tone={o.overdueCount ? 'attention' : 'neutral'} hint={`${o.overdueCount} invoice${o.overdueCount === 1 ? '' : 's'}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle action={<Link href="/business/calendar" className="text-sm font-medium text-signal hover:text-signal-hover">Calendar</Link>}>Today</SectionTitle>
          {o.todayVisits.length === 0 ? (
            <p className="text-sm text-graphite-soft">No visits booked today.</p>
          ) : (
            <ul className="divide-y divide-line">
              {o.todayVisits.map((visit) => (
                <li key={visit.id}>
                  <Link href={`/business/calendar/${visit.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-signal">
                    <span className="min-w-0">
                      <span className="block font-medium text-graphite">{formatTimeRange(visit.startsAt, visit.endsAt, business.timezone)}</span>
                      <span className="block truncate text-graphite-soft">
                        {KIND_LABELS[visit.kind]} · {visit.customer?.name ?? 'Customer'}
                        {visit.property ? `, ${visit.property.suburb}` : ''}
                      </span>
                    </span>
                    <span className={visit.technician ? 'shrink-0 text-micro text-zinc-deep' : 'shrink-0 text-micro font-semibold text-caution'}>{visit.technician?.name ?? 'No technician'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle action={<Link href="/business/jobs" className="text-sm font-medium text-signal hover:text-signal-hover">All jobs</Link>}>Waiting for a visit</SectionTitle>
          {o.unscheduledJobs.length === 0 ? (
            <p className="text-sm text-graphite-soft">Every open job has a visit booked.</p>
          ) : (
            <ul className="divide-y divide-line">
              {o.unscheduledJobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/jobs/${job.id}`} className="min-w-0 hover:text-signal">
                    <span className="block truncate font-medium text-graphite">{job.title ?? job.description.split('\n')[0]}</span>
                    <span className="block truncate text-graphite-soft">
                      {job.businessCustomer?.name ?? 'Customer'}
                      {job.property ? `, ${job.property.suburb}` : ''} · {job.reference}
                    </span>
                  </Link>
                  <SecondaryLink href={`/business/calendar/new?job=${job.id}`} className="h-9 shrink-0 px-3">
                    Book
                  </SecondaryLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {o.lowStock > 0 && (
        <div className="mt-6">
          <Empty title={`${o.lowStock} stock item${o.lowStock === 1 ? ' is' : 's are'} at or below the reorder level`} action={<SecondaryLink href="/business/stock?show=low">See stock</SecondaryLink>} />
        </div>
      )}
    </>
  )
}
