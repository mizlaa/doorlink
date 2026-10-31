'use server'

import { revalidatePath } from 'next/cache'
import { JobStatus, NotificationType } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, type Session } from '@/lib/auth'
import { can, requireSession, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import { AUTO_COMPLETE_DAYS, canTransition, jobActorFor, isReviewable, recomputeWorkerRating } from '@/lib/marketplace'
import { jobHasOnlinePayment, refundJob } from '@/lib/payments/job-payments'
import { connectConfigured } from '@/lib/payments/connect'
import { notifyCustomer } from '@/lib/pricing/notify'
import { mediaUploadsAvailable, newMediaKey, readImageFile, saveMedia } from '@/lib/media'
import { notify } from '@/lib/notifications'
import { JOB_STATUS_LABELS } from '@/lib/labels'

export type JobActionState = { error?: string; ok?: boolean }

const STATUSES = [
  'REQUESTED',
  'ACCEPTED',
  'AWAITING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'SCHEDULED',
  'IN_PROGRESS',
  'BUSINESS_COMPLETED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
] as const

const transitionSchema = z.object({
  jobId: z.string().trim().min(1),
  toStatus: z.enum(STATUSES),
  note: z.string().trim().max(500).optional(),
  scheduledAt: z.string().trim().optional(),
})

export async function transitionJobAction(
  _prevState: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  let session: Session
  try {
    session = requireSession(await getSession())
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const note = String(formData.get('note') ?? '').trim()
  const scheduledAt = String(formData.get('scheduledAt') ?? '').trim()

  const parsed = transitionSchema.safeParse({
    jobId: formData.get('jobId'),
    toStatus: formData.get('toStatus'),
    note: note.length > 0 ? note : undefined,
    scheduledAt: scheduledAt.length > 0 ? scheduledAt : undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  try {
    const job = await prisma.job.findUnique({ where: { id: parsed.data.jobId } })
    if (!job) return { error: 'Job not found.' }

    const actor = jobActorFor(job, session.userId, can(session.role, 'job:write:any'))
    // Neither party to the job, and not an admin — indistinguishable
    // from the job not existing.
    if (!actor) return { error: 'Job not found.' }

    const next = JobStatus[parsed.data.toStatus]
    const paid = await jobHasOnlinePayment(job.id)
    if (!canTransition(actor, job.status, next, { paid })) {
      return {
        error:
          paid && next === JobStatus.CANCELLED
            ? 'You’ve paid for this job, so raise a problem instead and Doorlink will help sort out a refund.'
            : `You can't move this job from ${JOB_STATUS_LABELS[job.status].toLowerCase()} to ${JOB_STATUS_LABELS[next].toLowerCase()}.`,
      }
    }
    if (next === JobStatus.SCHEDULED && !parsed.data.scheduledAt) return { error: 'Pick the date and time.' }
    if ((next === JobStatus.CANCELLED || next === JobStatus.DISPUTED) && !parsed.data.note)
      return { error: 'Say why, so both sides have a record.' }

    const timestamps: Record<string, Date | null> = {}
    if (next === JobStatus.IN_PROGRESS) timestamps.startedAt = new Date()
    if (next === JobStatus.COMPLETED) timestamps.completedAt = new Date()
    if (next === JobStatus.CANCELLED) timestamps.cancelledAt = new Date()
    if (next === JobStatus.BUSINESS_COMPLETED) {
      timestamps.businessCompletedAt = new Date()
      timestamps.autoCompleteAt = new Date(Date.now() + AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000)
    }

    await prisma.$transaction(async (tx) => {
      // Conditional on the status read above: two people pressing buttons
      // at once can't both move the job.
      const moved = await tx.job.updateMany({
        where: { id: job.id, status: job.status },
        data: {
          status: next,
          ...timestamps,
          ...(parsed.data.scheduledAt ? { scheduledAt: new Date(parsed.data.scheduledAt) } : {}),
          ...(next === JobStatus.CANCELLED && parsed.data.note
            ? { cancellationReason: parsed.data.note }
            : {}),
        },
      })
      if (moved.count === 0) throw new StaleJobError()

      if (next === JobStatus.DISPUTED && job.customerId) {
        await tx.dispute.create({
          data: { jobId: job.id, raisedById: session.userId, reason: parsed.data.note ?? 'Problem raised', detail: null },
        })
      }

      await tx.jobStatusEvent.create({
        data: {
          jobId: job.id,
          fromStatus: job.status,
          toStatus: next,
          actorId: session.userId,
          note: parsed.data.note ?? null,
        },
      })

      // A completed job changes a worker's public record, so the cached
      // counts are recomputed from source rather than incremented.
      if (next === JobStatus.COMPLETED && job.workerId) {
        await recomputeWorkerRating(job.workerId, tx)
      }

      // Whoever did not press the button is the one who needs telling.
      const otherId = session.userId === job.customerId ? job.workerId : job.customerId
      if (otherId) {
        await notify(
          {
            userId: otherId,
            type:
              next === JobStatus.SCHEDULED
                ? NotificationType.JOB_SCHEDULED
                : next === JobStatus.COMPLETED
                  ? NotificationType.JOB_COMPLETED
                  : NotificationType.ORDER_UPDATE,
            title: `Job ${job.reference} is now ${JOB_STATUS_LABELS[next].toLowerCase()}`,
            body: parsed.data.note ?? `Moved from ${JOB_STATUS_LABELS[job.status].toLowerCase()}.`,
            href: `/jobs/${job.id}`,
          },
          tx
        )
      }
    })
    // A business cancelling a paid job refunds the customer in full.
    if (next === JobStatus.CANCELLED && actor !== 'customer' && paid && connectConfigured()) {
      await refundJob(job.id, parsed.data.note ?? 'Cancelled by the business')
    }
    if (job.customerId && actor !== 'customer' && CUSTOMER_EMAILS[next]) {
      await notifyCustomer(job.customerId, {
        type: next === JobStatus.SCHEDULED ? NotificationType.JOB_SCHEDULED : NotificationType.BOOKING_UPDATE,
        title: CUSTOMER_EMAILS[next]!,
        body:
          next === JobStatus.SCHEDULED && parsed.data.scheduledAt
            ? `Booked for ${new Date(parsed.data.scheduledAt).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' })}.`
            : (parsed.data.note ?? `Job ${job.reference}.`),
        href: `/jobs/${job.id}`,
      }, { email: true })
    }
    if (next === JobStatus.COMPLETED && job.customerId) {
      await notifyCustomer(job.customerId, {
        type: NotificationType.REVIEW_REQUEST,
        title: 'Rate your experience',
        body: `Job ${job.reference} is complete. Your verified review helps other customers choose.`,
        href: `/jobs/${job.id}#review`,
      })
    }
  } catch (error) {
    if (error instanceof StaleJobError) return { error: 'This job was just updated by someone else. Refresh to see it.' }
    if (isRecordNotFound(error)) return { error: 'Job not found.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath(`/jobs/${parsed.data.jobId}`)
  revalidatePath('/jobs')
  return { ok: true }
}

class StaleJobError extends Error {}

/** What the customer is emailed when the business moves their job on. */
const CUSTOMER_EMAILS: Partial<Record<JobStatus, string>> = {
  SCHEDULED: 'Your installation is scheduled',
  IN_PROGRESS: 'Work has started on your job',
  BUSINESS_COMPLETED: 'Your job is finished. Please confirm',
  CANCELLED: 'Your job was cancelled',
}

const subRating = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 5), 'Detail ratings are 1 to 5 stars.')

const reviewSchema = z.object({
  jobId: z.string().trim().min(1),
  rating: z.coerce.number().int().min(1, 'Choose a rating.').max(5),
  body: z.string().trim().max(2000).optional(),
  workmanship: subRating,
  communication: subRating,
  valueForMoney: subRating,
  punctuality: subRating,
  recommend: z.enum(['yes', 'no', '']),
})

/**
 * A verified review: only the customer on a job completed through
 * Doorlink can leave one, one per job. Editing keeps the previous wording
 * as a revision, so a correction can't quietly rewrite what the business
 * replied to.
 */
export async function reviewJobAction(
  _prevState: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  let session: Session
  try {
    session = requireSession(await getSession())
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const body = String(formData.get('body') ?? '').trim()
  const parsed = reviewSchema.safeParse({
    jobId: formData.get('jobId'),
    rating: formData.get('rating'),
    body: body.length > 0 ? body : undefined,
    workmanship: formData.get('workmanship') ?? '',
    communication: formData.get('communication') ?? '',
    valueForMoney: formData.get('valueForMoney') ?? '',
    punctuality: formData.get('punctuality') ?? '',
    recommend: formData.get('recommend') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  const d = parsed.data

  const photos = []
  for (const file of formData.getAll('photos').slice(0, 4)) {
    const image = await readImageFile(file)
    if (!image) continue
    if (!image.ok) return { error: image.error }
    photos.push(image)
  }
  if (photos.length > 0 && !mediaUploadsAvailable()) return { error: 'Photo uploads aren’t connected yet.' }

  try {
    const job = await prisma.job.findUnique({ where: { id: d.jobId }, include: { workerReview: true } })
    if (!job || job.customerId !== session.userId) return { error: 'Job not found.' }
    if (!job.workerId) return { error: 'This job has no business to review.' }

    // The rule that keeps ratings meaningful: a review can only exist
    // for work that actually reached COMPLETED through Doorlink.
    if (!isReviewable(job.status)) {
      return { error: 'You can review a job once it has been completed.' }
    }

    const existing = job.workerReview
    if (existing && existing.photoKeys.length + photos.length > 4) return { error: 'A review holds up to 4 photos.' }
    const photoKeys: string[] = []
    for (const photo of photos) {
      const key = newMediaKey('reviews', job.id, photo.type)
      await saveMedia(key, photo.bytes, photo.type)
      photoKeys.push(key)
    }

    const fields = {
      rating: d.rating,
      body: d.body ?? null,
      workmanship: d.workmanship,
      communication: d.communication,
      valueForMoney: d.valueForMoney,
      punctuality: d.punctuality,
      recommend: d.recommend === '' ? null : d.recommend === 'yes',
    }

    await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.workerReviewRevision.create({
          data: {
            reviewId: existing.id,
            rating: existing.rating,
            body: existing.body,
            detail: {
              workmanship: existing.workmanship,
              communication: existing.communication,
              valueForMoney: existing.valueForMoney,
              punctuality: existing.punctuality,
              recommend: existing.recommend,
            },
          },
        })
        await tx.workerReview.update({
          where: { id: existing.id },
          data: { ...fields, editedAt: new Date(), photoKeys: [...existing.photoKeys, ...photoKeys] },
        })
      } else {
        await tx.workerReview.create({
          data: { jobId: job.id, authorId: session.userId, workerId: job.workerId!, photoKeys, ...fields },
        })
      }
      await recomputeWorkerRating(job.workerId!, tx)

      await notify(
        {
          userId: job.workerId!,
          type: NotificationType.REVIEW_RECEIVED,
          title: `${existing ? 'Updated' : 'New'} ${d.rating}-star review on job ${job.reference}`,
          body: d.body ?? 'No comment was left.',
          href: `/jobs/${job.id}#review`,
        },
        tx
      )
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'Job not found.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath(`/jobs/${d.jobId}`)
  return { ok: true }
}

/**
 * The business's public reply to a review on one of its jobs. It can be
 * reworded, but the business can never change the customer's review.
 */
export async function replyToReviewAction(
  _prevState: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const session = requireSession(await getSession())
  const reply = String(formData.get('reply') ?? '').trim()
  if (reply.length < 2) return { error: 'Write a reply.' }
  if (reply.length > 1000) return { error: 'Keep the reply under 1000 characters.' }
  const review = await prisma.workerReview.findUnique({
    where: { id: String(formData.get('reviewId') ?? '') },
    include: { job: { select: { id: true, workerId: true, organizationId: true } } },
  })
  if (!review) return { error: 'Review not found.' }
  const isBusiness =
    review.job.workerId === session.userId ||
    (!!review.job.organizationId && session.organizationId === review.job.organizationId)
  if (!isBusiness) return { error: 'Review not found.' }

  await prisma.workerReview.update({
    where: { id: review.id },
    data: { workerReply: reply, workerRepliedAt: new Date() },
  })
  await notify({
    userId: review.authorId,
    type: NotificationType.REVIEW_RECEIVED,
    title: 'The business replied to your review',
    body: reply.slice(0, 200),
    href: `/jobs/${review.job.id}#review`,
  })
  revalidatePath(`/jobs/${review.job.id}`)
  return { ok: true }
}
