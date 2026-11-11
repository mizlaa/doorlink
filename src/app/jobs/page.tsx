import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { ACTIVE_JOB_STATUSES } from '@/lib/marketplace'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { JOB_STATUS_LABELS, JOB_STATUS_TONE } from '@/lib/labels'

export const metadata: Metadata = { title: 'Jobs' }

export default async function JobsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  let jobs
  try {
    jobs = await prisma.job.findMany({
      where: { OR: [{ customerId: session.userId }, { workerId: session.userId }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        worker: { select: { id: true, name: true, technicianProfile: { select: { businessName: true } } } },
        lead: { select: { title: true } },
      },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Jobs" reason="Can't reach the database right now." />
      </div>
    )
  }

  const active = jobs.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status))
  const finished = jobs.filter((job) => !ACTIVE_JOB_STATUSES.includes(job.status))

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Jobs</h1>
        <p className="mt-1 text-graphite-soft">
          Work you&apos;ve hired someone for, and work you&apos;ve been hired to do.
        </p>
      </header>

      <JobSection title={`Active (${active.length})`} jobs={active} userId={session.userId} emptyLabel="No active jobs" />
      <JobSection
        title={`Finished (${finished.length})`}
        jobs={finished}
        userId={session.userId}
        emptyLabel="Nothing finished yet"
      />
    </div>
  )
}

type JobRow = {
  id: string
  reference: string
  status: keyof typeof JOB_STATUS_LABELS
  description: string
  agreedPriceCents: number | null
  currency: string
  scheduledAt: Date | null
  customerId: string | null
  customer: { id: string; name: string } | null
  worker: { id: string; name: string; technicianProfile: { businessName: string | null } | null } | null
  lead: { title: string | null } | null
}

function JobSection({
  title,
  jobs,
  userId,
  emptyLabel,
}: {
  title: string
  jobs: JobRow[]
  userId: string
  emptyLabel: string
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">{title}</h2>
      {jobs.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => {
            const viewingAsCustomer = job.customerId === userId
            const counterparty = viewingAsCustomer
              ? job.worker?.technicianProfile?.businessName || job.worker?.name || 'Unassigned'
              : job.customer?.name || 'Customer'

            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="block rounded-md border border-line bg-paper p-5 transition-colors hover:border-signal"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">
                        {job.lead?.title ?? job.description.slice(0, 80)}
                      </p>
                      <p className="mt-1 font-code text-micro text-zinc-deep">{job.reference}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {job.agreedPriceCents !== null && (
                        <span className="font-medium text-graphite">
                          {formatMoney(job.agreedPriceCents, job.currency)}
                        </span>
                      )}
                      <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-zinc-deep">
                    {viewingAsCustomer ? 'Technician' : 'Customer'}: {counterparty}
                    {job.scheduledAt &&
                      ` · scheduled ${job.scheduledAt.toLocaleDateString('en-AU', {
                        timeZone: 'Australia/Sydney',
                        day: 'numeric',
                        month: 'short',
                      })}`}
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
