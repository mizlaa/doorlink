import type { Metadata } from 'next'
import Link from 'next/link'
import { JobStatus, type Prisma } from '@prisma/client'
import { businessPage } from '@/lib/business/guard'
import { linkBusinessJobs } from '@/lib/business/links'
import { LIVE_VISIT, OPEN_JOB_STATUSES } from '@/lib/business/overview'
import { JOB_STATUS_LABELS } from '@/lib/labels'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { formatInZone } from '@/lib/timezone'
import { Empty, PageHeader, Pill, PrimaryLink, type PillTone } from '@/components/business/ui'
import { Input } from '@/components/ui/Field'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Jobs' }

const FILTERS: Array<{ id: string; label: string; where: Prisma.JobWhereInput }> = [
  { id: 'open', label: 'Open', where: { status: { in: OPEN_JOB_STATUSES } } },
  { id: 'new', label: 'To confirm', where: { status: JobStatus.REQUESTED } },
  { id: 'unscheduled', label: 'No visit', where: { status: { in: [JobStatus.ACCEPTED, JobStatus.PAYMENT_CONFIRMED, JobStatus.SCHEDULED] }, appointments: { none: { status: { in: LIVE_VISIT } } } } },
  { id: 'done', label: 'Done', where: { status: JobStatus.COMPLETED } },
  { id: 'all', label: 'All', where: {} },
]

const TONE: Partial<Record<JobStatus, PillTone>> = {
  REQUESTED: 'amber',
  AWAITING_PAYMENT: 'amber',
  DISPUTED: 'red',
  COMPLETED: 'green',
  CANCELLED: 'neutral',
  DECLINED: 'neutral',
  IN_PROGRESS: 'blue',
  SCHEDULED: 'blue',
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const gate = await businessPage('MANAGER', '/business/jobs')
  if (!gate.ok) return gate.screen
  const { business } = gate
  await linkBusinessJobs(business)
  const params = await searchParams
  const filter = FILTERS.find((f) => f.id === params.show) ?? FILTERS[0]
  const q = (params.q ?? '').trim().slice(0, 60)
  const search: Prisma.JobWhereInput = q
    ? { OR: [{ reference: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { businessCustomer: { name: { contains: q, mode: 'insensitive' } } }, { property: { suburb: { contains: q, mode: 'insensitive' } } }] }
    : {}

  const jobs = await prisma.job.findMany({
    where: { businessId: business.businessId, ...filter.where, ...search },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      reference: true,
      title: true,
      description: true,
      status: true,
      agreedPriceCents: true,
      currency: true,
      updatedAt: true,
      businessCustomer: { select: { name: true } },
      property: { select: { suburb: true } },
      appointments: { where: { status: { in: LIVE_VISIT } }, orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true, technician: { select: { name: true } } } },
    },
  })

  return (
    <>
      <PageHeader title="Jobs" action={<PrimaryLink href="/business/calendar/new">Book a visit</PrimaryLink>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-1.5" aria-label="Show">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={f.id === 'open' ? '/business/jobs' : `/business/jobs?show=${f.id}`}
              aria-current={filter.id === f.id ? 'true' : undefined}
              className={cn('rounded-full border px-3 py-1.5 text-sm font-medium', filter.id === f.id ? 'border-graphite bg-graphite text-paper' : 'border-line bg-rail text-graphite-soft hover:text-graphite')}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="sm:w-64" role="search">
          {filter.id !== 'open' && <input type="hidden" name="show" value={filter.id} />}
          <Input name="q" defaultValue={q} placeholder="Customer, suburb or JOB-…" aria-label="Search jobs" />
        </form>
      </div>

      {jobs.length === 0 ? (
        <Empty title="Nothing here">{q ? 'No jobs match that search.' : 'Jobs appear here when you accept a request or a customer books one of your quotes.'}</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-rail">
          {jobs.map((job) => {
            const visit = job.appointments[0]
            return (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-paper">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-graphite">{job.title ?? job.description.split('\n')[0]}</span>
                    <span className="block truncate text-micro text-zinc-deep">
                      {job.businessCustomer?.name ?? 'Customer'}
                      {job.property ? `, ${job.property.suburb}` : ''} · {job.reference}
                      {visit ? ` · next visit ${formatInZone(visit.startsAt, business.timezone, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${visit.technician ? ` with ${visit.technician.name}` : ''}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone={TONE[job.status] ?? 'neutral'}>{JOB_STATUS_LABELS[job.status]}</Pill>
                    {job.agreedPriceCents ? <span className="text-micro tabular-nums text-zinc-deep">{formatMoney(job.agreedPriceCents, job.currency)}</span> : null}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
