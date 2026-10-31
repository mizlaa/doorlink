import 'server-only'

import { JobStatus, NotificationType } from '@prisma/client'
import { recomputeWorkerRating } from '@/lib/marketplace'
import { notifyMany } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

/**
 * Completes jobs the business marked finished when the customer has
 * neither confirmed nor disputed within the window. Safe to run any
 * number of times: each job moves only from BUSINESS_COMPLETED, inside a
 * conditional update, so two runs can't both complete it.
 */
export async function completeOverdueJobs(where: { id?: string } = {}): Promise<number> {
  const due = await prisma.job.findMany({
    where: { ...where, status: JobStatus.BUSINESS_COMPLETED, autoCompleteAt: { lte: new Date() } },
    select: { id: true, reference: true, customerId: true, workerId: true },
    take: 200,
  })
  let completed = 0
  for (const job of due) {
    const done = await prisma.$transaction(async (tx) => {
      const moved = await tx.job.updateMany({
        where: { id: job.id, status: JobStatus.BUSINESS_COMPLETED },
        data: { status: JobStatus.COMPLETED, completedAt: new Date() },
      })
      if (moved.count === 0) return false
      await tx.jobStatusEvent.create({
        data: {
          jobId: job.id,
          fromStatus: JobStatus.BUSINESS_COMPLETED,
          toStatus: JobStatus.COMPLETED,
          note: 'Completed automatically: the customer didn’t confirm or raise a problem within 7 days.',
        },
      })
      if (job.workerId) await recomputeWorkerRating(job.workerId, tx)
      await notifyMany(
        [
          ...(job.customerId
            ? [
                {
                  userId: job.customerId,
                  type: NotificationType.REVIEW_REQUEST,
                  title: `Job ${job.reference} is complete. Rate your experience`,
                  body: 'Your verified review helps other customers choose.',
                  href: `/jobs/${job.id}#review`,
                },
              ]
            : []),
          ...(job.workerId
            ? [
                {
                  userId: job.workerId,
                  type: NotificationType.JOB_COMPLETED,
                  title: `Job ${job.reference} is complete`,
                  body: 'The customer didn’t respond within 7 days, so it completed automatically.',
                  href: `/jobs/${job.id}`,
                },
              ]
            : []),
        ],
        tx
      )
      return true
    })
    if (done) completed++
  }
  return completed
}
