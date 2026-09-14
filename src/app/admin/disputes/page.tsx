import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DisputeStatus, JobStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { DisputeForm } from './DisputeForm'

export const metadata: Metadata = { title: 'Disputes' }

const OPEN: DisputeStatus[] = [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]

const STATUS_TONE = {
  OPEN: 'bad',
  IN_REVIEW: 'caution',
  RESOLVED: 'good',
  REJECTED: 'neutral',
} as const

export default async function AdminDisputesPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  let open
  let closed
  try {
    ;[open, closed] = await Promise.all([
      prisma.dispute.findMany({
        where: { status: { in: OPEN } },
        orderBy: { createdAt: 'asc' },
        include: {
          raisedBy: { select: { id: true, name: true } },
          job: {
            select: {
              id: true,
              reference: true,
              status: true,
              agreedPriceCents: true,
              currency: true,
              lead: { select: { title: true } },
              customer: { select: { name: true } },
              worker: { select: { name: true, technicianProfile: { select: { businessName: true } } } },
            },
          },
        },
      }),
      prisma.dispute.findMany({
        where: { status: { in: [DisputeStatus.RESOLVED, DisputeStatus.REJECTED] } },
        orderBy: { resolvedAt: 'desc' },
        take: 15,
        include: { job: { select: { id: true, reference: true } } },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Disputes" reason="Can't reach the database right now." />
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">Open disputes ({open.length})</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          A job in dispute cannot move until someone here decides. Both sides see whatever you write, and the
          job itself stays stuck in Disputed unless you also say what it becomes.
        </p>

        <div className="mt-5">
          {open.length === 0 ? (
            <EmptyState title="Nothing open" description="No job is currently in dispute." />
          ) : (
            <ul className="flex flex-col gap-4">
              {open.map((dispute) => (
                <li key={dispute.id} className="rounded-md border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">
                        <Link href={`/jobs/${dispute.job.id}`} className="text-signal hover:text-signal-hover">
                          {dispute.job.lead?.title ?? dispute.job.reference}
                        </Link>
                      </p>
                      <p className="mt-0.5 text-micro text-zinc-deep">
                        {dispute.job.reference}
                        {' · '}
                        {dispute.job.customer?.name ?? 'Customer'}
                        {' vs '}
                        {dispute.job.worker?.technicianProfile?.businessName ??
                          dispute.job.worker?.name ??
                          'technician'}
                        {dispute.job.agreedPriceCents !== null &&
                          ` · ${formatMoney(dispute.job.agreedPriceCents, dispute.job.currency)}`}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[dispute.status]}>
                      {dispute.status === 'IN_REVIEW' ? 'In review' : 'Open'}
                    </Badge>
                  </div>

                  <div className="mt-4 rounded-md border border-line bg-rail p-4">
                    <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">
                      Raised by {dispute.raisedBy.name}
                      {' · '}
                      {dispute.createdAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                    </p>
                    <p className="mt-1 font-medium text-graphite">{dispute.reason}</p>
                    {dispute.detail && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-graphite-soft">{dispute.detail}</p>
                    )}
                  </div>

                  <div className="mt-4 border-t border-line pt-4">
                    <DisputeForm
                      disputeId={dispute.id}
                      jobIsDisputed={dispute.job.status === JobStatus.DISPUTED}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Recently decided</h2>
        <div className="mt-4">
          {closed.length === 0 ? (
            <EmptyState title="No decisions yet" />
          ) : (
            <ul className="flex flex-col gap-2">
              {closed.map((dispute) => (
                <li
                  key={dispute.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/jobs/${dispute.job.id}`}
                      className="font-medium text-signal hover:text-signal-hover"
                    >
                      {dispute.job.reference}
                    </Link>
                    {dispute.resolution && (
                      <span className="mt-0.5 block text-micro text-zinc-deep">{dispute.resolution}</span>
                    )}
                  </span>
                  <Badge tone={STATUS_TONE[dispute.status]}>
                    {dispute.status === 'RESOLVED' ? 'Resolved' : 'Rejected'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
