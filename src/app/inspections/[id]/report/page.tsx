import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AnswerStatus, InspectionStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { canUpload } from '@/lib/storage'
import { NoOrganizationError, requireInspectionScope } from '@/lib/inspections/scope'
import { loadTemplate, toEngineAnswer } from '@/lib/inspections/load'
import {
  indexAnswers,
  severityRank,
  tallyAnswers,
  unmetPhotoRequirements,
  RESULT_POLICY,
} from '@/lib/inspections/engine'
import { compareInspections } from '@/lib/inspections/history'
import { RbacError } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { NotConnected } from '@/components/ui/NotConnected'
import { PrintButton } from '@/components/ui/PrintButton'
import {
  ANSWER_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  INSPECTION_RESULT_LABELS,
  SEVERITY_LABELS,
} from '@/lib/labels'
import './inspection-print.css'

export const metadata: Metadata = { title: 'Inspection report', robots: { index: false } }

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function InspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  const tradeAccess = await tradeSubscriptionAccess(session)
  if (!tradeAccess.allowed) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <TradeSubscriptionPaywall />
      </div>
    )
  }

  let scope
  try {
    scope = requireInspectionScope(session, 'inspection:read')
  } catch (error) {
    if (error instanceof NoOrganizationError) redirect('/inspections')
    if (error instanceof RbacError) redirect('/')
    throw error
  }

  const { id } = await params

  let inspection
  let previous
  try {
    inspection = await prisma.inspection.findFirst({
      where: { id, organizationId: scope.organizationId },
      include: {
        organization: { select: { name: true } },
        client: { select: { name: true, contactName: true } },
        site: { select: { name: true, addressLine: true, suburb: true, state: true, postcode: true } },
        asset: true,
        technician: { select: { name: true } },
        answers: {
          include: {
            question: { select: { prompt: true, unit: true } },
            evidence: { select: { id: true, caption: true, capturedAt: true, kind: true } },
          },
        },
        findings: {
          where: { dismissedAt: null },
          include: { answer: { select: { questionCode: true } } },
        },
        actions: { orderBy: { severity: 'desc' } },
        reportVersions: { orderBy: { version: 'desc' } },
      },
    })
    if (!inspection) notFound()

    previous = await prisma.inspection.findFirst({
      where: {
        assetId: inspection.assetId,
        organizationId: scope.organizationId,
        status: InspectionStatus.COMPLETED,
        id: { not: inspection.id },
      },
      orderBy: { submittedAt: 'desc' },
      select: {
        reference: true,
        submittedAt: true,
        answers: { select: { questionCode: true, status: true } },
      },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="This report" reason="Can't reach the database right now." />
      </div>
    )
  }

  const template = await loadTemplate(inspection.templateId)
  const answerIndex = indexAnswers(inspection.answers.map(toEngineAnswer))
  const tally = template
    ? tallyAnswers(template, inspection.asset.assetType, answerIndex)
    : { passed: 0, failed: 0, notApplicable: 0, notTested: 0 }

  const findings = [...inspection.findings].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  )

  const recurring = new Set(
    previous
      ? compareInspections(
          inspection.answers.map(toEngineAnswer),
          previous.answers.map((answer) => ({
            questionCode: answer.questionCode,
            status: answer.status,
            valueText: null,
            valueNumber: null,
            valueDate: null,
            valueChoices: [],
            note: null,
            evidenceCount: 0,
          }))
        )
          .filter((comparison) => comparison.state === 'recurring')
          .map((comparison) => comparison.questionCode)
      : []
  )

  // Read from the frozen report payload where one exists, so a reissued
  // report keeps saying what was true when it was issued, and fall back
  // to live state while the inspection is still a preview.
  const frozen = inspection.reportVersions[0]?.payload as { unmetPhotoRequirements?: unknown } | null
  const unmetPhotos = Array.isArray(frozen?.unmetPhotoRequirements)
    ? (frozen.unmetPhotoRequirements as unknown[]).filter(
        (entry): entry is string => typeof entry === 'string'
      )
    : template
      ? unmetPhotoRequirements(template, inspection.asset.assetType, answerIndex, {
          photoCaptureAvailable: canUpload(),
        })
      : []

  const version = inspection.reportVersions[0]?.version ?? null
  const issued = inspection.status === InspectionStatus.COMPLETED
  const evidence = inspection.answers.flatMap((answer) =>
    answer.evidence.map((item) => ({ ...item, prompt: answer.question.prompt }))
  )

  const siteAddress = [
    inspection.site.addressLine,
    inspection.site.suburb,
    inspection.site.state,
    inspection.site.postcode,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print-sheet">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/inspections/${inspection.id}`} className="text-sm text-signal hover:underline">
          ← Back to the inspection
        </Link>
        <PrintButton label="Print or save as PDF" />
      </div>

      {!issued && (
        <div className="no-print mb-6 rounded border border-caution/30 bg-caution-tint px-4 py-3 text-sm">
          <p className="font-medium text-caution">This inspection is not finished.</p>
          <p className="mt-1 text-graphite-soft">
            What follows is a preview of the report as it currently stands, not an issued document. It
            has no version number and should not be given to a customer.
          </p>
        </div>
      )}

      {/* Page 1 — the summary a customer reads first. */}
      <header className="print-block border-b-2 border-graphite pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.18em] text-graphite">
              {inspection.organization.name}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">
              Inspection report
            </h1>
            <p className="mt-0.5 text-graphite-soft">{inspection.inspectionType}</p>
          </div>
          <dl className="text-right text-micro text-graphite-soft">
            <div>
              <dt className="inline">Report </dt>
              <dd className="inline font-code text-graphite">{inspection.reference}</dd>
            </div>
            <div>
              <dt className="inline">Version </dt>
              <dd className="inline text-graphite">{version ? `V${version}` : 'Draft — not issued'}</dd>
            </div>
            <div>
              <dt className="inline">Date </dt>
              <dd className="inline text-graphite">{formatDate(inspection.submittedAt)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="print-block mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">Customer</h2>
          <p className="mt-1 font-medium text-graphite">{inspection.client.name}</p>
          {inspection.client.contactName && (
            <p className="text-sm text-graphite-soft">{inspection.client.contactName}</p>
          )}
          <p className="mt-2 text-sm text-graphite-soft">{inspection.site.name}</p>
          {siteAddress && <p className="text-sm text-graphite-soft">{siteAddress}</p>}
        </div>
        <div>
          <h2 className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">
            Carried out by
          </h2>
          <p className="mt-1 font-medium text-graphite">{inspection.technician.name}</p>
          {inspection.technicianLicence && (
            <p className="text-sm text-graphite-soft">
              Licence: {inspection.technicianLicence}
              <span className="block text-micro text-zinc">
                As stated by the technician. Not verified against any register.
              </span>
            </p>
          )}
          {inspection.jobNumber && (
            <p className="mt-2 text-sm text-graphite-soft">Job number {inspection.jobNumber}</p>
          )}
        </div>
      </section>

      {/* The headline outcome, with the counts that back it up beside
          it — so a reader can check the conclusion rather than trust it. */}
      <section className="print-block mt-6 rounded-md border-2 border-graphite p-5">
        <h2 className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">Overall result</h2>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-graphite">
          {inspection.result ? INSPECTION_RESULT_LABELS[inspection.result] : 'Not yet determined'}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
          {[
            ['Passed', tally.passed],
            ['Failed', tally.failed],
            ['Not applicable', tally.notApplicable],
            ['Not tested', tally.notTested],
            ['Flagged items', findings.length],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-micro uppercase tracking-wide text-zinc-deep">{label}</dt>
              <dd className="text-lg font-semibold text-graphite">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-micro leading-relaxed text-zinc-deep">
          How this was decided: an inspection is reported as failed when any finding is graded{' '}
          {SEVERITY_LABELS[RESULT_POLICY.failedAtOrAbove].toLowerCase()} or above, and as needing
          attention when any finding is graded{' '}
          {SEVERITY_LABELS[RESULT_POLICY.attentionAtOrAbove].toLowerCase()} or above, or any check was
          failed. Severity is the technician&rsquo;s assessment of risk. It is not a determination that
          any legal requirement has or has not been met — that depends on the jurisdiction and the duty
          holder, and needs professional advice.
        </p>
      </section>

      <section className="print-block mt-6">
        <h2 className="border-b border-line pb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
          Asset inspected
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['Name', inspection.asset.name],
            ['Asset ID', inspection.asset.reference],
            ['Type', ASSET_TYPE_LABELS[inspection.asset.assetType]],
            ['Location', inspection.asset.location],
            ['Manufacturer', inspection.asset.manufacturerName],
            ['Model', inspection.asset.modelName],
            ['Serial number', inspection.asset.serialNumber],
            ['Installed', inspection.asset.installedAt ? formatDate(inspection.asset.installedAt) : null],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex gap-2">
              <dt className="w-32 shrink-0 text-zinc-deep">{label}</dt>
              <dd className="text-graphite">{value || <span className="text-zinc">Not recorded</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Flagged items get their own section before the full checklist:
          this is the part a customer needs, and burying it under sixty
          passed questions is how a report stops being read. */}
      {/* Flows on from the summary rather than forcing its own page: with
          one or two findings a forced break produces a mostly empty
          sheet, and a reader flicking through a printed report reads
          that as the document having ended. */}
      <section className="mt-8">
        <h2 className="border-b border-line pb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
          Flagged items ({findings.length})
        </h2>

        {findings.length === 0 ? (
          <p className="mt-3 text-sm text-graphite-soft">
            Nothing was flagged during this inspection.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {findings.map((finding) => (
              <li
                key={finding.id}
                className={`print-block print-severity print-severity-${finding.severity.toLowerCase()} pl-3`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-graphite">{finding.title}</p>
                  <span className="text-micro font-semibold uppercase tracking-wide text-graphite-soft">
                    {SEVERITY_LABELS[finding.severity]}
                  </span>
                </div>
                {finding.observation && (
                  <p className="mt-1 text-sm text-graphite-soft">
                    <span className="text-zinc-deep">Observed: </span>
                    {finding.observation}
                  </p>
                )}
                {finding.recommendation && (
                  <p className="mt-1 text-sm text-graphite-soft">
                    <span className="text-zinc-deep">Recommended: </span>
                    {finding.recommendation}
                  </p>
                )}
                {finding.questionCode && recurring.has(finding.questionCode) && (
                  <p className="mt-1 text-micro text-caution">
                    Also recorded at the previous inspection ({previous?.reference},{' '}
                    {formatDate(previous?.submittedAt)}).
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {inspection.actions.length > 0 && (
        <section className="print-block mt-8">
          <h2 className="border-b border-line pb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
            Actions ({inspection.actions.length})
          </h2>
          <ul className="mt-3 grid gap-3">
            {inspection.actions.map((action) => (
              <li key={action.id} className="print-block text-sm">
                <p className="font-medium text-graphite">{action.title}</p>
                {action.description && <p className="text-graphite-soft">{action.description}</p>}
                <p className="mt-0.5 text-micro text-zinc-deep">
                  {SEVERITY_LABELS[action.severity]} · {action.status}
                  {action.dueAt ? ` · due ${formatDate(action.dueAt)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The full record. Everything asked and everything answered — the
          flagged section above is a summary of this, never a substitute. */}
      <section className="print-page-break mt-8">
        <h2 className="border-b border-line pb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
          Full inspection record
        </h2>
        {template ? (
          template.sections.map((section) => {
            const rows = section.questions
              .map((question) => ({ question, answer: inspection.answers.find((a) => a.questionCode === question.code) }))
              .filter((row) => row.answer)
            if (rows.length === 0) return null
            return (
              <div key={section.id} className="mt-5">
                <h3 className="text-sm font-semibold text-graphite">{section.title}</h3>
                <table className="mt-2 w-full border-collapse text-sm">
                  <tbody>
                    {rows.map(({ question, answer }) => (
                      <tr key={question.code} className="print-rule border-t border-line align-top">
                        <td className="py-2 pr-4 text-graphite">
                          {question.prompt}
                          {answer?.note && (
                            <span className="mt-0.5 block text-micro text-graphite-soft">
                              {answer.note}
                            </span>
                          )}
                        </td>
                        <td className="w-28 py-2 text-right font-medium text-graphite">
                          {answer?.status
                            ? ANSWER_STATUS_LABELS[answer.status]
                            : answer?.valueChoices.length
                              ? answer.valueChoices.join(', ')
                              : answer?.valueText ||
                                (answer?.valueNumber !== null && answer?.valueNumber !== undefined
                                  ? `${answer.valueNumber}${question.unit ? ` ${question.unit}` : ''}`
                                  : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })
        ) : (
          <p className="mt-3 text-sm text-graphite-soft">
            The template for this inspection is no longer available, so the full question list cannot be
            reproduced.
          </p>
        )}
      </section>

      <section className="print-block mt-8">
        <h2 className="border-b border-line pb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
          Photographic evidence
        </h2>
        {unmetPhotos.length > 0 && (
          <div className="print-block mt-3 border border-caution/40 px-3 py-2 text-sm">
            <p className="font-medium text-caution">
              Photographic evidence could not be captured for this inspection.
            </p>
            <p className="mt-1 text-graphite-soft">
              File storage is not configured on this system, so the following checks were carried out
              and recorded but could not be photographed. This is a limitation of the recording system,
              not a decision by the technician that evidence was unnecessary.
            </p>
            <ul className="mt-2 list-disc pl-5 text-graphite-soft">
              {unmetPhotos.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </div>
        )}

        {evidence.length === 0 ? (
          <p className="mt-3 text-sm text-graphite-soft">
            No photographs are attached to this inspection.
          </p>
        ) : (
          <ol className="mt-3 grid gap-3">
            {evidence.map((item, index) => (
              <li key={item.id} className="print-block text-sm">
                <p className="font-medium text-graphite">
                  Photo {String(index + 1).padStart(2, '0')}
                </p>
                <p className="text-graphite-soft">{item.prompt}</p>
                {item.caption && <p className="text-graphite-soft">{item.caption}</p>}
                <p className="text-micro text-zinc-deep">
                  {inspection.asset.name} · {formatDate(item.capturedAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {inspection.notes && (
        <section className="print-block mt-8">
          <h2 className="border-b border-line pb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
            Technician comments
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm text-graphite-soft">{inspection.notes}</p>
        </section>
      )}

      <section className="print-block mt-8 border-t-2 border-graphite pt-4">
        <h2 className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">Declaration</h2>
        {inspection.reviewStatement ? (
          <p className="mt-2 text-sm text-graphite-soft">
            &ldquo;{inspection.reviewStatement}&rdquo;
            <span className="mt-1 block text-graphite">
              {inspection.technician.name} — {formatDate(inspection.reviewedAt)}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc">Not yet signed off.</p>
        )}

        {inspection.customerAckName && (
          <p className="mt-3 text-sm text-graphite-soft">
            Acknowledged on site by {inspection.customerAckName} on{' '}
            {formatDate(inspection.customerAckAt)}.
          </p>
        )}
      </section>

      <footer className="print-block mt-6 border-t border-line pt-3 text-micro text-zinc-deep">
        <p>
          {inspection.organization.name} · Report {inspection.reference}
          {version ? ` · V${version}` : ''} · {formatDate(inspection.submittedAt)}
        </p>
        <p className="mt-1">
          This report records the condition of the equipment as observed on the date of inspection. It
          is not a certificate of compliance and does not constitute legal or engineering advice.
        </p>
      </footer>
    </div>
  )
}
