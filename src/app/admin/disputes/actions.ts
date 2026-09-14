'use server'

import { revalidatePath } from 'next/cache'
import { DisputeStatus, JobStatus, NotificationType } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requirePermission, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import { notify } from '@/lib/notifications'

export type DisputeActionState = { error?: string; ok?: boolean }

const schema = z.object({
  disputeId: z.string().trim().min(1),
  decision: z.enum(['IN_REVIEW', 'RESOLVED', 'REJECTED']),
  resolution: z.string().trim().max(1000).optional(),
  // What the job should become once the dispute is settled. A dispute
  // that is closed without deciding what happens to the job leaves the
  // job stuck in DISPUTED forever.
  jobOutcome: z.enum(['COMPLETED', 'CANCELLED', 'LEAVE']).optional(),
})

export async function decideDisputeAction(
  _prevState: DisputeActionState,
  formData: FormData
): Promise<DisputeActionState> {
  let actorId: string
  try {
    actorId = requirePermission(await getSession(), 'admin:settings').userId
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const resolution = String(formData.get('resolution') ?? '').trim()
  const parsed = schema.safeParse({
    disputeId: formData.get('disputeId'),
    decision: formData.get('decision'),
    resolution: resolution.length > 0 ? resolution : undefined,
    jobOutcome: formData.get('jobOutcome') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  // Closing a dispute without saying why leaves both parties with a
  // decision and no reason for it.
  if (parsed.data.decision !== 'IN_REVIEW' && !parsed.data.resolution) {
    return { error: 'Say how it was resolved — both people on the job see this.' }
  }

  const status = DisputeStatus[parsed.data.decision]

  try {
    const dispute = await prisma.dispute.findUnique({
      where: { id: parsed.data.disputeId },
      include: {
        job: { select: { id: true, reference: true, customerId: true, workerId: true, status: true } },
      },
    })
    if (!dispute) return { error: 'That dispute no longer exists.' }

    await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          status,
          resolution: parsed.data.resolution ?? null,
          resolvedAt: status === DisputeStatus.IN_REVIEW ? null : new Date(),
        },
      })

      const outcome = parsed.data.jobOutcome
      if (outcome && outcome !== 'LEAVE' && dispute.job.status === JobStatus.DISPUTED) {
        const next = JobStatus[outcome]
        await tx.job.update({
          where: { id: dispute.job.id },
          data: {
            status: next,
            ...(next === JobStatus.COMPLETED ? { completedAt: new Date() } : {}),
            ...(next === JobStatus.CANCELLED ? { cancelledAt: new Date() } : {}),
          },
        })
        await tx.jobStatusEvent.create({
          data: {
            jobId: dispute.job.id,
            fromStatus: JobStatus.DISPUTED,
            toStatus: next,
            actorId,
            note: `Dispute resolved by Doorlink. ${parsed.data.resolution ?? ''}`.trim(),
          },
        })
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'dispute.decide',
          entityType: 'Dispute',
          entityId: dispute.id,
          metadata: {
            from: dispute.status,
            to: status,
            jobOutcome: outcome ?? 'LEAVE',
            resolution: parsed.data.resolution ?? null,
          },
        },
      })

      // Both sides of the job hear the outcome, not just whoever raised it.
      for (const userId of [dispute.job.customerId, dispute.job.workerId]) {
        if (!userId) continue
        await notify(
          {
            userId,
            type: NotificationType.SYSTEM,
            title:
              status === DisputeStatus.IN_REVIEW
                ? `Doorlink is reviewing the dispute on job ${dispute.job.reference}`
                : `The dispute on job ${dispute.job.reference} has been decided`,
            body: parsed.data.resolution ?? 'A Doorlink admin has picked this up.',
            href: `/jobs/${dispute.job.id}`,
          },
          tx
        )
      }
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'That dispute no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/disputes')
  revalidatePath('/admin/metrics')
  return { ok: true }
}
