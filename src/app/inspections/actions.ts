'use server'

import { revalidatePath } from 'next/cache'
import { AnswerStatus, AssetType, InspectionStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requireSession, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import {
  isTradeSubscriptionRequiredError,
  requireTradeSubscription,
} from '@/lib/trade-subscription'
import { makeReference } from '@/lib/reference'
import { canUpload } from '@/lib/storage'
import {
  NoOrganizationError,
  requireInspectionScope,
  type InspectionScope,
} from '@/lib/inspections/scope'
import { loadTemplate, toEngineAnswer } from '@/lib/inspections/load'
import {
  derivedFindings,
  deriveResult,
  indexAnswers,
  indexQuestions,
  isQuestionVisible,
  outstandingRequirements,
  tallyAnswers,
  unmetPhotoRequirements,
} from '@/lib/inspections/engine'

export type InspectionActionState = { error?: string; ok?: boolean; id?: string }

// Every action here starts from the session's organisation. No action
// takes an organizationId from the form — a client-supplied scope is an
// invitation to read another company's asset register (brief §33).
async function scope(
  permission: 'inspection:read' | 'inspection:write' | 'asset:write' = 'inspection:write'
): Promise<InspectionScope | InspectionActionState> {
  try {
    const session = requireSession(await getSession())
    await requireTradeSubscription(session)
    return requireInspectionScope(session, permission)
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      return { error: 'Inspections belong to a company. Ask an owner to add you to one.' }
    }
    if (error instanceof RbacError) return { error: error.message }
    if (isTradeSubscriptionRequiredError(error)) return { error: error.message }
    throw error
  }
}

function isState(value: unknown): value is InspectionActionState {
  return typeof value === 'object' && value !== null && !('organizationId' in value)
}

function dbError(error: unknown): InspectionActionState | null {
  if (isRecordNotFound(error)) return { error: 'That record no longer exists.' }
  if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
  return null
}

// ---------------------------------------------------------------------
// Register: clients, sites, assets
// ---------------------------------------------------------------------

const clientSchema = z.object({
  name: z.string().trim().min(1, 'Give the customer a name.').max(200),
  contactName: z.string().trim().max(200).optional(),
  email: z.string().trim().email('That email address is not valid.').optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
})

export async function createClientAction(
  _prev: InspectionActionState,
  formData: FormData
): Promise<InspectionActionState> {
  const active = await scope('asset:write')
  if (isState(active)) return active

  const parsed = clientSchema.safeParse({
    name: formData.get('name'),
    contactName: formData.get('contactName') || undefined,
    email: formData.get('email') || undefined,
    phone: formData.get('phone') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  try {
    const client = await prisma.client.create({
      data: {
        organizationId: active.organizationId,
        name: parsed.data.name,
        contactName: parsed.data.contactName || null,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
      },
      select: { id: true },
    })
    revalidatePath('/inspections/new')
    return { ok: true, id: client.id }
  } catch (error) {
    const known = dbError(error)
    if (known) return known
    throw error
  }
}

const siteSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1, 'Give the site a name.').max(200),
  addressLine: z.string().trim().max(300).optional(),
  suburb: z.string().trim().max(120).optional(),
  state: z.string().trim().max(10).optional(),
  postcode: z.string().trim().max(10).optional(),
})

export async function createSiteAction(
  _prev: InspectionActionState,
  formData: FormData
): Promise<InspectionActionState> {
  const active = await scope('asset:write')
  if (isState(active)) return active

  const parsed = siteSchema.safeParse({
    clientId: formData.get('clientId'),
    name: formData.get('name'),
    addressLine: formData.get('addressLine') || undefined,
    suburb: formData.get('suburb') || undefined,
    state: formData.get('state') || undefined,
    postcode: formData.get('postcode') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  try {
    // The client is re-read inside the scope rather than trusted from
    // the form: a posted clientId belonging to another company would
    // otherwise attach a site to their customer.
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, organizationId: active.organizationId },
      select: { id: true },
    })
    if (!client) return { error: 'Customer not found.' }

    const site = await prisma.site.create({
      data: {
        organizationId: active.organizationId,
        clientId: client.id,
        name: parsed.data.name,
        addressLine: parsed.data.addressLine || null,
        suburb: parsed.data.suburb || null,
        state: parsed.data.state || null,
        postcode: parsed.data.postcode || null,
      },
      select: { id: true },
    })
    revalidatePath('/inspections/new')
    return { ok: true, id: site.id }
  } catch (error) {
    const known = dbError(error)
    if (known) return known
    throw error
  }
}

const assetSchema = z.object({
  siteId: z.string().trim().min(1),
  name: z.string().trim().min(1, 'Give the asset a name.').max(200),
  assetType: z.nativeEnum(AssetType),
  location: z.string().trim().max(200).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  manufacturerName: z.string().trim().max(120).optional(),
  modelName: z.string().trim().max(120).optional(),
})

export async function createAssetAction(
  _prev: InspectionActionState,
  formData: FormData
): Promise<InspectionActionState> {
  const active = await scope('asset:write')
  if (isState(active)) return active

  const parsed = assetSchema.safeParse({
    siteId: formData.get('siteId'),
    name: formData.get('name'),
    assetType: formData.get('assetType'),
    location: formData.get('location') || undefined,
    serialNumber: formData.get('serialNumber') || undefined,
    manufacturerName: formData.get('manufacturerName') || undefined,
    modelName: formData.get('modelName') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  try {
    const site = await prisma.site.findFirst({
      where: { id: parsed.data.siteId, organizationId: active.organizationId },
      select: { id: true, clientId: true },
    })
    if (!site) return { error: 'Site not found.' }

    const asset = await prisma.asset.create({
      data: {
        organizationId: active.organizationId,
        clientId: site.clientId,
        siteId: site.id,
        reference: makeReference('ASSET'),
        name: parsed.data.name,
        assetType: parsed.data.assetType,
        location: parsed.data.location || null,
        serialNumber: parsed.data.serialNumber || null,
        manufacturerName: parsed.data.manufacturerName || null,
        modelName: parsed.data.modelName || null,
      },
      select: { id: true },
    })
    revalidatePath('/inspections/new')
    return { ok: true, id: asset.id }
  } catch (error) {
    const known = dbError(error)
    if (known) return known
    throw error
  }
}

// ---------------------------------------------------------------------
// Starting an inspection
// ---------------------------------------------------------------------

const startSchema = z.object({
  assetId: z.string().trim().min(1, 'Choose an asset.'),
  templateId: z.string().trim().min(1, 'Choose an inspection type.'),
  inspectionType: z.string().trim().min(1, 'Name this inspection.').max(120),
  jobNumber: z.string().trim().max(60).optional(),
  siteContact: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  technicianLicence: z.string().trim().max(120).optional(),
})

export async function startInspectionAction(
  _prev: InspectionActionState,
  formData: FormData
): Promise<InspectionActionState> {
  const active = await scope('inspection:write')
  if (isState(active)) return active

  const parsed = startSchema.safeParse({
    assetId: formData.get('assetId'),
    templateId: formData.get('templateId'),
    inspectionType: formData.get('inspectionType'),
    jobNumber: formData.get('jobNumber') || undefined,
    siteContact: formData.get('siteContact') || undefined,
    contactPhone: formData.get('contactPhone') || undefined,
    technicianLicence: formData.get('technicianLicence') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  try {
    const asset = await prisma.asset.findFirst({
      where: { id: parsed.data.assetId, organizationId: active.organizationId },
      select: { id: true, clientId: true, siteId: true },
    })
    if (!asset) return { error: 'Asset not found.' }

    // A company template must belong to this company; a Doorlink one
    // (organizationId null) is available to everyone.
    const template = await prisma.inspectionTemplate.findFirst({
      where: {
        id: parsed.data.templateId,
        publishedAt: { not: null },
        OR: [{ organizationId: active.organizationId }, { organizationId: null }],
      },
      select: { id: true, version: true },
    })
    if (!template) return { error: 'Inspection type not found.' }

    const inspection = await prisma.$transaction(async (tx) => {
      const created = await tx.inspection.create({
        data: {
          organizationId: active.organizationId,
          clientId: asset.clientId,
          siteId: asset.siteId,
          assetId: asset.id,
          templateId: template.id,
          templateVersion: template.version,
          inspectionType: parsed.data.inspectionType,
          technicianId: active.session.userId,
          technicianLicence: parsed.data.technicianLicence || null,
          jobNumber: parsed.data.jobNumber || null,
          siteContact: parsed.data.siteContact || null,
          contactPhone: parsed.data.contactPhone || null,
          reference: makeReference('INSP'),
          status: InspectionStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
        select: { id: true },
      })

      await tx.inspectionStatusEvent.create({
        data: {
          inspectionId: created.id,
          fromStatus: null,
          toStatus: InspectionStatus.IN_PROGRESS,
          actorId: active.session.userId,
        },
      })

      return created
    })

    revalidatePath('/inspections')
    return { ok: true, id: inspection.id }
  } catch (error) {
    const known = dbError(error)
    if (known) return known
    throw error
  }
}

// ---------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------

const answerSchema = z.object({
  inspectionId: z.string().trim().min(1),
  questionId: z.string().trim().min(1),
  status: z.nativeEnum(AnswerStatus).nullable().optional(),
  valueText: z.string().trim().max(4000).optional(),
  valueNumber: z.coerce.number().optional(),
  valueChoices: z.array(z.string().max(300)).max(40).optional(),
  note: z.string().trim().max(4000).optional(),
})

/**
 * Saves one answer. Called on every change by the wizard's autosave, so
 * it is deliberately small and idempotent — a technician who loses
 * signal mid-inspection keeps every answer up to the last one that
 * reached the server, and repeating a save changes nothing.
 */
export async function saveAnswerAction(input: {
  inspectionId: string
  questionId: string
  status?: AnswerStatus | null
  valueText?: string
  valueNumber?: number
  valueChoices?: string[]
  note?: string
}): Promise<InspectionActionState> {
  const active = await scope('inspection:write')
  if (isState(active)) return active

  const parsed = answerSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'That answer could not be saved.' }

  try {
    const inspection = await prisma.inspection.findFirst({
      where: { id: parsed.data.inspectionId, organizationId: active.organizationId },
      select: { id: true, status: true, templateId: true },
    })
    if (!inspection) return { error: 'Inspection not found.' }
    // A completed inspection is a record of what was found. Changing an
    // answer on it would rewrite an issued report in place, so editing
    // goes through reopening, which produces a new report version.
    if (inspection.status === InspectionStatus.COMPLETED) {
      return { error: 'This inspection is complete. Reopen it to make a change.' }
    }
    if (inspection.status === InspectionStatus.CANCELLED) {
      return { error: 'This inspection was cancelled.' }
    }

    // The question must belong to this inspection's template — a posted
    // questionId from another template would otherwise write an answer
    // that no report could ever render.
    const question = await prisma.templateQuestion.findFirst({
      where: { id: parsed.data.questionId, section: { templateId: inspection.templateId } },
      select: { id: true, code: true },
    })
    if (!question) return { error: 'That question is not part of this inspection.' }

    const data = {
      status: parsed.data.status ?? null,
      valueText: parsed.data.valueText?.length ? parsed.data.valueText : null,
      valueNumber: Number.isFinite(parsed.data.valueNumber) ? parsed.data.valueNumber! : null,
      valueChoices: parsed.data.valueChoices ?? [],
      note: parsed.data.note?.length ? parsed.data.note : null,
    }

    await prisma.inspectionAnswer.upsert({
      where: {
        inspectionId_questionId: {
          inspectionId: inspection.id,
          questionId: question.id,
        },
      },
      update: data,
      create: {
        inspectionId: inspection.id,
        questionId: question.id,
        questionCode: question.code,
        ...data,
      },
    })

    return { ok: true }
  } catch (error) {
    const known = dbError(error)
    if (known) return known
    throw error
  }
}

// ---------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------

const submitSchema = z.object({
  inspectionId: z.string().trim().min(1),
  reviewStatement: z.literal('on', {
    errorMap: () => ({ message: 'Confirm the record reflects the inspection you carried out.' }),
  }),
  customerAckName: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
})

const REVIEW_STATEMENT =
  'I have reviewed the inspection information and confirm that the information recorded accurately reflects the inspection performed.'

/**
 * Completes an inspection.
 *
 * The outstanding-requirements check runs here, on the server, from the
 * template — not from whatever the form chose to submit. A technician
 * who never answered a required question cannot get a completed report
 * by posting the form without it, and an inspection cannot be signed
 * off without the statement being made.
 */
export async function submitInspectionAction(
  _prev: InspectionActionState,
  formData: FormData
): Promise<InspectionActionState> {
  const active = await scope('inspection:write')
  if (isState(active)) return active

  const parsed = submitSchema.safeParse({
    inspectionId: formData.get('inspectionId'),
    reviewStatement: formData.get('reviewStatement'),
    customerAckName: formData.get('customerAckName') || undefined,
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  try {
    const inspection = await prisma.inspection.findFirst({
      where: { id: parsed.data.inspectionId, organizationId: active.organizationId },
      include: {
        asset: { select: { assetType: true } },
        answers: { include: { _count: { select: { evidence: true } } } },
        reportVersions: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 },
      },
    })
    if (!inspection) return { error: 'Inspection not found.' }
    if (inspection.status === InspectionStatus.CANCELLED) {
      return { error: 'This inspection was cancelled.' }
    }

    const template = await loadTemplate(inspection.templateId)
    if (!template) return { error: 'This inspection’s template is missing.' }

    // Mirrors the wizard: with no storage backend a photo requirement
    // cannot be met by anyone, so it relaxes rather than making every
    // inspection on this deployment impossible to finish. What was
    // asked for and could not be supplied is recorded on the report
    // below, so nothing implies a photograph exists.
    const engineOptions = { photoCaptureAvailable: canUpload() }

    const answers = indexAnswers(inspection.answers.map(toEngineAnswer))
    const outstanding = outstandingRequirements(
      template,
      inspection.asset.assetType,
      answers,
      engineOptions
    )
    if (outstanding.length > 0) {
      const first = outstanding[0]
      const reason =
        first.reason === 'unanswered'
          ? 'is unanswered'
          : first.reason === 'note-required'
            ? 'needs an explanation'
            : 'needs a photo'
      return {
        error:
          outstanding.length === 1
            ? `“${first.prompt}” ${reason}.`
            : `${outstanding.length} items still need attention — the first is “${first.prompt}”, which ${reason}.`,
      }
    }

    // Findings are recomputed from the answers rather than trusted from
    // whatever was written during the walkthrough: an answer changed
    // after a rule fired must not leave the old finding behind.
    const questionIndex = indexQuestions(template)
    const fresh = [...questionIndex.values()]
      .filter((question) => isQuestionVisible(question, questionIndex, answers))
      .flatMap((question) => derivedFindings(question, answers.get(question.code)))

    const tally = tallyAnswers(template, inspection.asset.assetType, answers)
    const result = deriveResult({
      severities: fresh.map((finding) => finding.severity),
      outstanding: [],
      failedAnswers: tally.failed,
    })

    const nextVersion = (inspection.reportVersions[0]?.version ?? 0) + 1
    const answerIdByCode = new Map(inspection.answers.map((a) => [a.questionCode, a.id]))

    await prisma.$transaction(async (tx) => {
      // Rule-generated findings are replaced wholesale; ones a
      // technician wrote or edited by hand are left alone.
      await tx.inspectionFinding.deleteMany({
        where: { inspectionId: inspection.id, ruleGenerated: true },
      })
      if (fresh.length > 0) {
        await tx.inspectionFinding.createMany({
          data: fresh.map((finding) => ({
            inspectionId: inspection.id,
            answerId: answerIdByCode.get(finding.questionCode) ?? null,
            questionCode: finding.questionCode,
            title: finding.title,
            observation: answers.get(finding.questionCode)?.note ?? null,
            recommendation: finding.recommendation,
            severity: finding.severity,
            ruleGenerated: true,
          })),
        })
      }

      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: InspectionStatus.COMPLETED,
          result,
          submittedAt: new Date(),
          reviewedAt: new Date(),
          reviewStatement: REVIEW_STATEMENT,
          customerAckName: parsed.data.customerAckName || null,
          customerAckAt: parsed.data.customerAckName ? new Date() : null,
          notes: parsed.data.notes || null,
        },
      })

      await tx.inspectionStatusEvent.create({
        data: {
          inspectionId: inspection.id,
          fromStatus: inspection.status,
          toStatus: InspectionStatus.COMPLETED,
          actorId: active.session.userId,
        },
      })

      // The issued report is frozen here. Reopening and resubmitting
      // writes version 2 beside it rather than over it, so a customer
      // holding version 1 is holding something that still exists.
      await tx.inspectionReportVersion.create({
        data: {
          inspectionId: inspection.id,
          version: nextVersion,
          result,
          generatedById: active.session.userId,
          payload: {
            generatedAt: new Date().toISOString(),
            templateName: template.name,
            templateVersion: inspection.templateVersion,
            // Frozen into the report: which photographs the template
            // asked for and the deployment could not capture. A reader
            // should never have to guess whether missing evidence means
            // "none was needed" or "none could be taken".
            photoCaptureAvailable: engineOptions.photoCaptureAvailable,
            unmetPhotoRequirements: unmetPhotoRequirements(
              template,
              inspection.asset.assetType,
              answers,
              engineOptions
            ),
            tally: {
              passed: tally.passed,
              failed: tally.failed,
              notApplicable: tally.notApplicable,
              notTested: tally.notTested,
            },
            findings: fresh.map((finding) => ({
              questionCode: finding.questionCode,
              title: finding.title,
              severity: finding.severity,
              recommendation: finding.recommendation,
              observation: answers.get(finding.questionCode)?.note ?? null,
            })),
            answers: inspection.answers.map((answer) => ({
              questionCode: answer.questionCode,
              status: answer.status,
              note: answer.note,
            })),
          } satisfies Prisma.InputJsonValue,
        },
      })
    })

    revalidatePath('/inspections')
    revalidatePath(`/inspections/${inspection.id}`)
    return { ok: true, id: inspection.id }
  } catch (error) {
    const known = dbError(error)
    if (known) return known
    throw error
  }
}

const reopenSchema = z.object({
  inspectionId: z.string().trim().min(1),
  reason: z.string().trim().min(1, 'Say why this is being reopened.').max(500),
})

/**
 * Reopens a completed inspection for correction. The issued report
 * version stays exactly where it is — resubmitting adds the next
 * version rather than editing the one already in a customer's hands.
 */
export async function reopenInspectionAction(
  _prev: InspectionActionState,
  formData: FormData
): Promise<InspectionActionState> {
  const active = await scope('inspection:write')
  if (isState(active)) return active

  const parsed = reopenSchema.safeParse({
    inspectionId: formData.get('inspectionId'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  try {
    const inspection = await prisma.inspection.findFirst({
      where: { id: parsed.data.inspectionId, organizationId: active.organizationId },
      select: { id: true, status: true },
    })
    if (!inspection) return { error: 'Inspection not found.' }
    if (inspection.status !== InspectionStatus.COMPLETED) {
      return { error: 'Only a completed inspection can be reopened.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.inspection.update({
        where: { id: inspection.id },
        data: { status: InspectionStatus.IN_PROGRESS, reviewedAt: null, reviewStatement: null },
      })
      await tx.inspectionStatusEvent.create({
        data: {
          inspectionId: inspection.id,
          fromStatus: InspectionStatus.COMPLETED,
          toStatus: InspectionStatus.IN_PROGRESS,
          actorId: active.session.userId,
          note: parsed.data.reason,
        },
      })
    })

    revalidatePath(`/inspections/${inspection.id}`)
    return { ok: true, id: inspection.id }
  } catch (error) {
    const known = dbError(error)
    if (known) return known
    throw error
  }
}
