'use server'

import { revalidatePath } from 'next/cache'
import { ReportStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requirePermission, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'

export type ReportActionState = { error?: string; ok?: boolean }

const schema = z.object({
  reportId: z.string().trim().min(1),
  decision: z.enum(['IN_REVIEW', 'ACTIONED', 'DISMISSED']),
})

export async function decideReportAction(
  _prevState: ReportActionState,
  formData: FormData
): Promise<ReportActionState> {
  let actorId: string
  try {
    actorId = requirePermission(await getSession(), 'admin:settings').userId
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = schema.safeParse({
    reportId: formData.get('reportId'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) return { error: 'Check the form and try again.' }

  const status = ReportStatus[parsed.data.decision]

  try {
    const report = await prisma.report.findUnique({ where: { id: parsed.data.reportId } })
    if (!report) return { error: 'That report no longer exists.' }

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: report.id },
        data: {
          status,
          reviewedById: actorId,
          reviewedAt: status === ReportStatus.IN_REVIEW ? null : new Date(),
        },
      })

      // Moderation decisions are audited like every other admin action.
      // "Who dismissed this report" is a question that gets asked later.
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'report.decide',
          entityType: 'Report',
          entityId: report.id,
          metadata: { from: report.status, to: status, targetType: report.targetType },
        },
      })
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'That report no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/reports')
  revalidatePath('/admin/metrics')
  return { ok: true }
}
