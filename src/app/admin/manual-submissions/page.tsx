import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AiVerdict, ScanState } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { signedFileUrl } from '@/lib/storage'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import {
  AI_VERDICT_LABELS,
  AI_VERDICT_TONE,
  SUBMISSION_LABELS,
  SUBMISSION_TONE,
} from '@/lib/labels'
import { REVIEWABLE_STATUSES } from '@/lib/manuals/submission-policy'
import { DecisionForm } from './DecisionForm'

export const metadata: Metadata = { title: 'Manual submissions' }

function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default async function ManualSubmissionsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'manual:review')) redirect('/admin')

  let queue
  let decided
  try {
    ;[queue, decided] = await Promise.all([
      prisma.manualSubmission.findMany({
        where: { status: { in: REVIEWABLE_STATUSES } },
        orderBy: { createdAt: 'asc' },
        include: {
          submittedBy: { select: { id: true, name: true, email: true } },
          duplicateOf: { select: { id: true, slug: true, title: true } },
        },
      }),
      prisma.manualSubmission.findMany({
        where: { status: { notIn: REVIEWABLE_STATUSES } },
        orderBy: { reviewedAt: 'desc' },
        take: 15,
        select: {
          id: true,
          reference: true,
          manufacturerName: true,
          productName: true,
          status: true,
          reviewedAt: true,
        },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Manual submissions" reason="Can't reach the database right now." />
  }

  // Signed, short-lived, and minted per render. An unapproved upload has
  // no public URL by design, so this is the only way to open one — and a
  // link that expires is the point, not an inconvenience.
  const previews = new Map<string, string | null>(
    await Promise.all(
      queue.map(async (submission) => {
        const url = submission.fileKey ? await signedFileUrl(submission.fileKey) : null
        return [submission.id, url] as const
      })
    )
  )

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">Waiting for review ({queue.length})</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Approving puts a manual in front of technicians working on live equipment. The automated check
          below is a first pass at spotting the obviously wrong — it has not decided anything, and a
          &ldquo;verified&rdquo; result is not a recommendation. Open the document and satisfy yourself
          before you approve it.
        </p>

        <div className="mt-6 flex flex-col gap-6">
          {queue.length === 0 ? (
            <EmptyState title="Nothing waiting" description="Uploaded manuals appear here for review." />
          ) : null}

          {queue.map((submission) => {
            const preview = previews.get(submission.id) ?? null
            return (
              <article key={submission.id} className="rounded border border-line bg-paper p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-graphite">
                      {submission.manufacturerName} {submission.productName}
                    </h3>
                    <p className="mt-1 text-sm text-graphite-soft">
                      Model {submission.modelCode} · {submission.categorySlug}
                      {submission.year ? ` · ${submission.year}` : ''}
                      {submission.serialNumber ? ` · serial ${submission.serialNumber}` : ''}
                    </p>
                    <p className="mt-1 font-mono text-xs text-graphite-soft">{submission.reference}</p>
                  </div>
                  <Badge tone={SUBMISSION_TONE[submission.status]}>
                    {SUBMISSION_LABELS[submission.status]}
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-graphite-soft">Uploaded by</dt>
                    <dd className="text-graphite">
                      {submission.submittedBy.name ?? submission.submittedBy.email}
                      {' · '}
                      {submission.createdAt.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-graphite-soft">File</dt>
                    <dd className="text-graphite">
                      {submission.originalFilename} · {submission.mimeType} ·{' '}
                      {bytes(submission.fileSizeBytes)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 rounded border border-line bg-rail p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={AI_VERDICT_TONE[submission.aiVerdict]}>
                      {AI_VERDICT_LABELS[submission.aiVerdict]}
                    </Badge>
                    {submission.aiConfidence !== null ? (
                      <span className="text-xs text-graphite-soft">
                        confidence {submission.aiConfidence}%
                      </span>
                    ) : null}
                    {submission.aiModel ? (
                      <span className="text-xs text-graphite-soft">{submission.aiModel}</span>
                    ) : null}
                  </div>
                  {submission.aiReasoning ? (
                    <p className="mt-2 whitespace-pre-line text-sm text-graphite">
                      {submission.aiReasoning}
                    </p>
                  ) : null}
                  {submission.aiVerdict === AiVerdict.NOT_RUN ||
                  submission.aiVerdict === AiVerdict.ERRORED ? (
                    <p className="mt-2 text-sm text-graphite-soft">
                      Nothing was checked automatically. Read the whole document.
                    </p>
                  ) : null}
                </div>

                {submission.duplicateOf ? (
                  <p className="mt-3 rounded border border-caution/40 bg-caution/5 px-3 py-2 text-sm text-graphite">
                    Looks like{' '}
                    <Link href={`/manuals/${submission.duplicateOf.slug}`} className="underline">
                      {submission.duplicateOf.title}
                    </Link>
                    . Approving will link this submission to that document rather than publishing a second
                    copy.
                  </p>
                ) : null}

                {submission.description ? (
                  <p className="mt-3 max-w-prose whitespace-pre-line text-sm text-graphite">
                    “{submission.description}”
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  {preview ? (
                    <a
                      href={preview}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-signal underline"
                    >
                      Open the document
                    </a>
                  ) : (
                    <span className="text-graphite-soft">
                      {submission.fileKey
                        ? 'Storage could not produce a link for this file.'
                        : 'No file is attached to this submission.'}
                    </span>
                  )}
                  {/* Word files are downloaded, never rendered inline —
                      they are containers that can carry macros. */}
                  {submission.mimeType.includes('word') || submission.mimeType.includes('msword') ? (
                    <span className="text-xs text-graphite-soft">
                      Word file — it downloads rather than opening in the browser.
                    </span>
                  ) : null}
                  {submission.scanState === ScanState.UNAVAILABLE ? (
                    <span className="text-xs text-graphite-soft">
                      Not virus-scanned — no scanner is connected. Treat it as untrusted.
                    </span>
                  ) : null}
                </div>

                <DecisionForm submissionId={submission.id} />
              </article>
            )
          })}
        </div>
      </section>

      {decided.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold text-graphite">Recently decided</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {decided.map((submission) => (
              <li
                key={submission.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-paper px-4 py-3 text-sm"
              >
                <span className="text-graphite">
                  {submission.manufacturerName} {submission.productName}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-graphite-soft">{submission.reference}</span>
                  <Badge tone={SUBMISSION_TONE[submission.status]}>
                    {SUBMISSION_LABELS[submission.status]}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
