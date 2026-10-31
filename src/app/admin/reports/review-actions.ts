'use server'

import { revalidatePath } from 'next/cache'
import { NotificationType } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac'
import { recomputeWorkerRating } from '@/lib/marketplace'
import { notify } from '@/lib/notifications'

/**
 * Hides or restores a review after an admin has looked at a report. A
 * hidden review stops counting towards the rating. It needs a reason,
 * the author is told why, and the change is logged; a review is never
 * hidden just because the business dislikes it.
 */
export async function moderateReviewAction(formData: FormData): Promise<void> {
  const session = requirePermission(await getSession(), 'admin:settings')
  const reviewId = String(formData.get('reviewId') ?? '')
  const status = formData.get('status') === 'HIDDEN' ? 'HIDDEN' : 'PUBLISHED'
  const note = String(formData.get('note') ?? '').trim().slice(0, 500)
  if (status === 'HIDDEN' && !note) return

  const review = await prisma.workerReview.findUnique({ where: { id: reviewId }, include: { job: { select: { reference: true, id: true } } } })
  if (!review || review.status === status) return

  await prisma.$transaction(async (tx) => {
    await tx.workerReview.update({ where: { id: review.id }, data: { status, moderationNote: note || null } })
    await recomputeWorkerRating(review.workerId, tx)
    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        action: status === 'HIDDEN' ? 'review.hide' : 'review.restore',
        entityType: 'WorkerReview',
        entityId: review.id,
        metadata: { note },
      },
    })
    await tx.report.updateMany({
      where: { targetType: 'WORKER_REVIEW', targetId: review.id, status: { in: ['OPEN', 'IN_REVIEW'] } },
      data: { status: 'ACTIONED', reviewedById: session.userId, reviewedAt: new Date() },
    })
    await notify(
      {
        userId: review.authorId,
        type: NotificationType.SYSTEM,
        title: status === 'HIDDEN' ? 'Your review was hidden' : 'Your review is visible again',
        body: status === 'HIDDEN' ? `A Doorlink admin hid it: ${note}` : 'A Doorlink admin restored it.',
        href: `/jobs/${review.job.id}#review`,
      },
      tx
    )
  })
  revalidatePath('/admin/reports')
}
