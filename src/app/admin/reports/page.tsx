import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ReportStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { ReportActions } from './ReportActions'

export const metadata: Metadata = { title: 'Reports' }

const OPEN: ReportStatus[] = [ReportStatus.OPEN, ReportStatus.IN_REVIEW]

const STATUS_TONE = {
  OPEN: 'bad',
  IN_REVIEW: 'caution',
  ACTIONED: 'good',
  DISMISSED: 'neutral',
} as const

const STATUS_LABELS = {
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  ACTIONED: 'Actioned',
  DISMISSED: 'Dismissed',
} as const

export default async function AdminReportsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  let open
  let closed
  try {
    ;[open, closed] = await Promise.all([
      prisma.report.findMany({
        where: { status: { in: OPEN } },
        orderBy: { createdAt: 'asc' },
        include: { reporter: { select: { name: true, email: true } } },
      }),
      prisma.report.findMany({
        where: { status: { in: [ReportStatus.ACTIONED, ReportStatus.DISMISSED] } },
        orderBy: { reviewedAt: 'desc' },
        take: 15,
        include: { reviewedBy: { select: { name: true } } },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Reports" reason="Can't reach the database right now." />
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">Open reports ({open.length})</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Things people have flagged — a listing, a message, a review, an account. Nothing in Doorlink files a
          report automatically; every one of these was written by a person.
        </p>

        <div className="mt-5">
          {open.length === 0 ? (
            <EmptyState title="Nothing reported" description="No open reports." />
          ) : (
            <ul className="flex flex-col gap-3">
              {open.map((report) => (
                <li key={report.id} className="rounded-md border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">{report.reason}</p>
                      <p className="mt-0.5 text-micro text-zinc-deep">
                        {report.targetType.toLowerCase()}
                        {' · '}
                        <span className="font-code">{report.targetId}</span>
                        {' · reported by '}
                        {report.reporter.name}
                        {' · '}
                        {report.createdAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[report.status]}>{STATUS_LABELS[report.status]}</Badge>
                  </div>

                  {report.detail && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-graphite-soft">{report.detail}</p>
                  )}

                  <div className="mt-4 border-t border-line pt-4">
                    <ReportActions reportId={report.id} />
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
              {closed.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="text-graphite">{report.reason}</span>
                    <span className="mt-0.5 block text-micro text-zinc-deep">
                      {report.targetType.toLowerCase()}
                      {report.reviewedBy && ` · decided by ${report.reviewedBy.name}`}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[report.status]}>{STATUS_LABELS[report.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
