'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { CompatibilityConfidence, CompatibilityKind, DataSource } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requirePermission, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import { requireTradeSubscription, isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'

export type CompatibilityFormState = { error?: string }

const KINDS = ['REPLACEMENT_PART', 'ACCESSORY', 'REMOTE_PAIR', 'CONTROL_BOARD_MATCH', 'MOTOR_MATCH'] as const
const CONFIDENCES = ['CONFIRMED', 'LIKELY', 'UNCONFIRMED'] as const
const DATA_SOURCES = ['DEMO', 'MANUFACTURER_VERIFIED', 'ADMIN_VERIFIED', 'COMMUNITY_SUBMITTED', 'IMPORTED'] as const

const compatibilitySchema = z
  .object({
    fromModelId: z.string().trim().min(1, 'Choose the first model.'),
    toModelId: z.string().trim().min(1, 'Choose the second model.'),
    kind: z.enum(KINDS),
    confidence: z.enum(CONFIDENCES),
    dataSource: z.enum(DATA_SOURCES),
    note: z.string().trim().optional(),
  })
  .refine((data) => data.fromModelId !== data.toModelId, {
    message: 'A model cannot be compatible with itself.',
    path: ['toModelId'],
  })

async function assertCanManageCatalogue() {
  const session = await getSession()
  const allowed = requirePermission(session, 'catalogue:write')
  try {
    await requireTradeSubscription(allowed)
  } catch (error) {
    if (isTradeSubscriptionRequiredError(error)) throw new RbacError(error.message, 403)
    throw error
  }
  return allowed
}

function readForm(formData: FormData) {
  return compatibilitySchema.safeParse({
    fromModelId: formData.get('fromModelId'),
    toModelId: formData.get('toModelId'),
    kind: formData.get('kind'),
    confidence: formData.get('confidence'),
    dataSource: formData.get('dataSource'),
    note: formData.get('note') || undefined,
  })
}

export async function createCompatibilityAction(
  _prevState: CompatibilityFormState,
  formData: FormData
): Promise<CompatibilityFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = readForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  const { fromModelId, toModelId, kind, confidence, dataSource, note } = parsed.data

  try {
    const existing = await prisma.compatibility.findUnique({
      where: { fromModelId_toModelId_kind: { fromModelId, toModelId, kind: CompatibilityKind[kind] } },
    })
    if (existing) return { error: 'This exact link (same two models and kind) already exists.' }

    await prisma.compatibility.create({
      data: {
        fromModelId,
        toModelId,
        kind: CompatibilityKind[kind],
        confidence: CompatibilityConfidence[confidence],
        dataSource: DataSource[dataSource],
        note: note || null,
      },
    })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/compatibility')
  redirect('/admin/compatibility')
}

export async function updateCompatibilityAction(
  id: string,
  _prevState: CompatibilityFormState,
  formData: FormData
): Promise<CompatibilityFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = readForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  const { fromModelId, toModelId, kind, confidence, dataSource, note } = parsed.data

  try {
    const clashing = await prisma.compatibility.findFirst({
      where: { fromModelId, toModelId, kind: CompatibilityKind[kind], NOT: { id } },
    })
    if (clashing) return { error: 'This exact link (same two models and kind) already exists.' }

    await prisma.compatibility.update({
      where: { id },
      data: {
        fromModelId,
        toModelId,
        kind: CompatibilityKind[kind],
        confidence: CompatibilityConfidence[confidence],
        dataSource: DataSource[dataSource],
        note: note || null,
      },
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'This compatibility link no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/compatibility')
  redirect('/admin/compatibility')
}

export async function deleteCompatibilityAction(
  _prevState: CompatibilityFormState,
  formData: FormData
): Promise<CompatibilityFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing compatibility link id.' }

  try {
    // A leaf table with nothing referencing it — unlike manufacturers,
    // categories, and models, there is no "still in use" failure mode here.
    await prisma.compatibility.delete({ where: { id } })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'This compatibility link no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/compatibility')
  redirect('/admin/compatibility')
}
