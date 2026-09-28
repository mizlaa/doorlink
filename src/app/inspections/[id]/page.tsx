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
  indexQuestions,
  inspectionProgress,
  isQuestionVisible,
  outstandingRequirements,
  visibleSections,
} from '@/lib/inspections/engine'
import { compareInspections } from '@/lib/inspections/history'
import { RbacError } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { NotConnected } from '@/components/ui/NotConnected'
import { Badge } from '@/components/ui/Badge'
import {
  ASSET_TYPE_LABELS,
  INSPECTION_RESULT_LABELS,
  INSPECTION_RESULT_TONE,
  INSPECTION_STATUS_LABELS,
  INSPECTION_STATUS_TONE,
} from '@/lib/labels'
import { Wizard } from './Wizard'
import { SubmitPanel } from './SubmitPanel'
import type { WizardAnswer, WizardSection } from './types'

export const metadata: Metadata = { title: 'Inspection' }

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
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
        client: { select: { name: true } },
        site: { select: { name: true, addressLine: true, suburb: true } },
        asset: { select: { id: true, name: true, assetType: true, reference: true, location: true } },
        technician: { select: { name: true } },
        answers: { include: { _count: { select: { evidence: true } } } },
        reportVersions: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 },
      },
    })
    if (!inspection) notFound()

    // The most recent completed inspection of the same asset, for the
    // recurring-defect comparison.
    previous = await prisma.inspection.findFirst({
      where: {
        assetId: inspection.assetId,
        organizationId: scope.organizationId,
        status: InspectionStatus.COMPLETED,
        id: { not: inspection.id },
      },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        reference: true,
        submittedAt: true,
        answers: { select: { questionCode: true, status: true } },
      },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="This inspection" reason="Can't reach the database right now." />
      </div>
    )
  }

  const template = await loadTemplate(inspection.templateId)
  if (!template) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected
          feature="This inspection"
          reason="Its template is missing, so the questions cannot be rendered."
        />
      </div>
    )
  }

  const engineAnswers = inspection.answers.map(toEngineAnswer)
  const answerIndex = indexAnswers(engineAnswers)
  const questionIndex = indexQuestions(template)
  const assetType = inspection.asset.assetType

  const storageUnavailable = !canUpload()
  const engineOptions = { photoCaptureAvailable: !storageUnavailable }

  const progress = inspectionProgress(template, assetType, answerIndex)
  const outstanding = outstandingRequirements(template, assetType, answerIndex, engineOptions)

  // Only the questions this asset and these answers actually call for.
  const sections: WizardSection[] = visibleSections(template, assetType)
    .map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      questions: section.questions
        .filter((question) => isQuestionVisible(question, questionIndex, answerIndex))
        .map((question) => ({
          id: question.id,
          code: question.code,
          prompt: question.prompt,
          helpText: question.helpText,
          type: question.type,
          required: question.required,
          options: question.options,
          requirePhoto: question.requirePhoto,
          recommendPhoto: question.recommendPhoto,
          requiresNoteWhenFailed: question.rules.some(
            (rule) => rule.whenStatus === AnswerStatus.FAIL && rule.requireNote
          ),
          requiresPhotoWhenFailed: question.rules.some(
            (rule) => rule.whenStatus === AnswerStatus.FAIL && rule.requirePhoto
          ),
        })),
    }))
    .filter((section) => section.questions.length > 0)

  const answers: Record<string, WizardAnswer> = {}
  for (const answer of inspection.answers) {
    answers[answer.questionCode] = {
      status: answer.status,
      valueText: answer.valueText ?? '',
      valueChoices: answer.valueChoices,
      note: answer.note ?? '',
      evidenceCount: answer._count.evidence,
    }
  }

  const recurring = previous
    ? compareInspections(
        engineAnswers,
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
      ).filter((comparison) => comparison.state === 'recurring')
    : []

  const readOnly =
    inspection.status === InspectionStatus.COMPLETED ||
    inspection.status === InspectionStatus.CANCELLED

  return (
    <div className="pb-24">
      {/* Persistent header — a technician three sections down should
          never have to scroll up to check which asset they are on. */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto max-w-shell px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-micro uppercase tracking-wide text-zinc-deep">
                {inspection.inspectionType}
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-graphite">
                {inspection.client.name} — {inspection.site.name}
              </h1>
              <p className="truncate text-sm text-graphite-soft">
                {inspection.asset.name} · {ASSET_TYPE_LABELS[assetType]}
                {inspection.asset.location ? ` · ${inspection.asset.location}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {inspection.result && (
                <Badge tone={INSPECTION_RESULT_TONE[inspection.result]}>
                  {INSPECTION_RESULT_LABELS[inspection.result]}
                </Badge>
              )}
              <Badge tone={INSPECTION_STATUS_TONE[inspection.status]}>
                {INSPECTION_STATUS_LABELS[inspection.status]}
              </Badge>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded bg-rail"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Questions answered"
            >
              <div
                className="h-full bg-signal transition-[width]"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="shrink-0 text-micro text-zinc-deep">
              {progress.answered} of {progress.visible}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-shell px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-zinc-deep">
          <span className="font-code">{inspection.reference}</span>
          <span>{inspection.technician.name}</span>
          {inspection.jobNumber && <span>Job {inspection.jobNumber}</span>}
          <Link href={`/inspections/${inspection.id}/report`} className="text-signal hover:underline">
            View report
          </Link>
          <Link href={`/assets/${inspection.asset.id}`} className="text-signal hover:underline">
            Asset history
          </Link>
        </div>

        {storageUnavailable && (
          <div className="mb-4 rounded border border-caution/30 bg-caution-tint px-4 py-3 text-sm text-graphite-soft">
            <span className="font-medium text-caution">Photo evidence is unavailable.</span> This
            deployment has no file storage configured, so photographs cannot be saved against answers.
            Questions that would normally require one will not block you from finishing, and the report
            says which photographs could not be taken — it does not record them as supplied.
          </div>
        )}

        {recurring.length > 0 && (
          <div className="mb-4 rounded border border-caution/30 bg-caution-tint px-4 py-3 text-sm">
            <p className="font-medium text-caution">
              {recurring.length} item{recurring.length === 1 ? '' : 's'} also failed at the previous
              inspection
            </p>
            <p className="mt-1 text-graphite-soft">
              Recorded on{' '}
              {previous?.submittedAt?.toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}{' '}
              ({previous?.reference}). Doorlink is reporting that the same answer repeated — not why.
            </p>
          </div>
        )}

        <Wizard
          inspectionId={inspection.id}
          sections={sections}
          answers={answers}
          readOnly={readOnly}
          storageUnavailable={storageUnavailable}
        />

        <SubmitPanel
          inspectionId={inspection.id}
          outstanding={outstanding}
          status={inspection.status}
          reportVersion={inspection.reportVersions[0]?.version ?? null}
        />
      </div>
    </div>
  )
}
