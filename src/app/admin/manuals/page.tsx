import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DocumentOrigin, VerificationState } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel'
import { DOCUMENT_KIND_LABELS } from '@/lib/labels'

export const metadata: Metadata = { title: 'Manual library' }

// The admin view of the manual library.
//
// Its job is to answer "what needs a human?", which is a different
// question from "what is in the library". Three queues: links a check
// found broken or restricted, documents nobody has checked at all, and
// models recorded with no documentation located.
//
// Read-only for now, deliberately. The library is maintained by editing
// data/manuals/*.json and re-running the importer, which keeps the seed
// files as the source of truth rather than splitting it between files
// and hand-edits nobody can review. This page tells an admin what to go
// and edit.

function VerificationBadge({ state }: { state: VerificationState }) {
  if (state === VerificationState.BROKEN) return <Badge tone="bad">Broken</Badge>
  if (state === VerificationState.RESTRICTED) return <Badge tone="caution">Login required</Badge>
  if (state === VerificationState.REACHABLE) return <Badge tone="good">Reachable</Badge>
  if (state === VerificationState.REDIRECTED) return <Badge tone="good">Moved</Badge>
  return <Badge tone="neutral">Unchecked</Badge>
}

export default async function AdminManualsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'catalogue:write')) redirect('/')

  try {
    const [flagged, unchecked, emptyModels, totals] = await Promise.all([
      prisma.document.findMany({
        where: { needsReview: true },
        select: {
          id: true,
          slug: true,
          title: true,
          kind: true,
          sourceUrl: true,
          verification: true,
          reviewReason: true,
          lastHttpStatus: true,
          lastVerifiedAt: true,
          manufacturer: { select: { name: true } },
        },
        orderBy: { lastVerifiedAt: 'desc' },
        take: 50,
      }),
      prisma.document.findMany({
        where: { verification: VerificationState.UNVERIFIED, dataSource: { not: 'DEMO' } },
        select: {
          id: true,
          slug: true,
          title: true,
          kind: true,
          origin: true,
          sourceUrl: true,
          verification: true,
          manufacturer: { select: { name: true } },
        },
        orderBy: [{ manufacturer: { name: 'asc' } }, { title: 'asc' }],
        take: 50,
      }),
      prisma.model.findMany({
        where: { documents: { none: {} }, dataSource: { not: 'DEMO' } },
        select: {
          id: true,
          name: true,
          modelCode: true,
          manufacturer: { select: { name: true } },
        },
        orderBy: { modelCode: 'asc' },
        take: 50,
      }),
      prisma.document.groupBy({
        by: ['verification'],
        where: { dataSource: { not: 'DEMO' } },
        _count: true,
      }),
    ])

    const total = totals.reduce((sum, row) => sum + row._count, 0)

    return (
      <div className="flex flex-col gap-6">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-graphite">Manual library</h1>
            {can(session.role, 'admin:settings') && (
              <Link
                href="/admin/manual-submissions"
                className="text-sm font-medium text-signal hover:text-signal-hover"
              >
                Review community submissions
              </Link>
            )}
          </div>
          <p className="mt-1 text-graphite-soft">
            {total} document{total === 1 ? '' : 's'} outside the demo catalogue. Maintained by editing{' '}
            <span className="font-code text-sm">data/manuals/*.json</span> and re-running{' '}
            <span className="font-code text-sm">npm run manuals:import</span>.
          </p>
        </header>

        <Panel>
          <PanelHeader>
            <h2 className="font-medium text-graphite">Link check status</h2>
          </PanelHeader>
          <PanelBody className="flex flex-wrap gap-6 text-sm">
            {totals.map((row) => (
              <div key={row.verification}>
                <VerificationBadge state={row.verification} />
                <p className="mt-1 text-lg font-semibold text-graphite">{row._count}</p>
              </div>
            ))}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="font-medium text-graphite">Flagged for review ({flagged.length})</h2>
          </PanelHeader>
          <PanelBody>
            {flagged.length === 0 ? (
              <p className="text-sm text-graphite-soft">
                Nothing flagged. A link check flags rather than deletes, so this fills up only after{' '}
                <span className="font-code">npm run manuals:verify</span> has run.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {flagged.map((doc) => (
                  <li key={doc.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <VerificationBadge state={doc.verification} />
                      <Link href={`/manuals/${doc.slug}`} className="font-medium text-signal hover:underline">
                        {doc.title}
                      </Link>
                      <span className="text-micro text-zinc-deep">{doc.manufacturer?.name}</span>
                    </div>
                    <p className="mt-0.5 text-micro text-graphite-soft">
                      {doc.reviewReason ?? 'No reason recorded'}
                      {doc.lastHttpStatus ? ` · HTTP ${doc.lastHttpStatus}` : ''}
                      {doc.lastVerifiedAt
                        ? ` · checked ${doc.lastVerifiedAt.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}`
                        : ''}
                    </p>
                    {doc.sourceUrl && (
                      <p className="truncate font-code text-micro text-zinc">{doc.sourceUrl}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="font-medium text-graphite">Never checked ({unchecked.length})</h2>
          </PanelHeader>
          <PanelBody>
            {unchecked.length === 0 ? (
              <EmptyState title="Every document has been checked at least once" />
            ) : (
              <>
                <p className="mb-3 text-sm text-graphite-soft">
                  These have never been fetched, so none of them carries an official badge — not even
                  the ones on a manufacturer&rsquo;s own domain.
                </p>
                <ul className="flex flex-col gap-2">
                  {unchecked.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-micro uppercase tracking-wide text-zinc-deep">
                        {DOCUMENT_KIND_LABELS[doc.kind]}
                      </span>
                      <Link href={`/manuals/${doc.slug}`} className="font-medium text-signal hover:underline">
                        {doc.title}
                      </Link>
                      <span className="text-micro text-zinc-deep">{doc.manufacturer?.name}</span>
                      {doc.origin === DocumentOrigin.MANUFACTURER_ORIGINAL && (
                        <Badge tone="neutral">Manufacturer source</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="font-medium text-graphite">
              Models with no documentation ({emptyModels.length})
            </h2>
          </PanelHeader>
          <PanelBody>
            {emptyModels.length === 0 ? (
              <EmptyState title="Every recorded model has at least one document" />
            ) : (
              <>
                <p className="mb-3 text-sm text-graphite-soft">
                  Recorded so the model is searchable and the gap is visible. This is the research
                  queue.
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {emptyModels.map((model) => (
                    <li key={model.id}>
                      <span className="font-code text-micro text-zinc-deep">{model.modelCode}</span>{' '}
                      <span className="text-graphite">{model.name}</span>{' '}
                      <span className="text-micro text-zinc-deep">{model.manufacturer.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </PanelBody>
        </Panel>
      </div>
    )
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="The manual library" reason="Can't reach the database right now." />
  }
}
