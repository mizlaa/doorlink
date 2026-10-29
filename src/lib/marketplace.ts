import { JobStatus, LeadStatus, NotificationType, Prisma, QuoteStatus } from '@prisma/client'
import { prisma } from './prisma'
import { calculateSplit } from './commission'
import { commissionBpsForWorker } from './commission-settings'
import { makeReference } from './reference'
import { notify } from './notifications'
import { formatMoney } from './money'

/**
 * The marketplace's state transitions, kept in one place so the rules
 * live somewhere a reader can check them rather than being spread across
 * the actions that happen to trigger them.
 */

/** Statuses where a lead is still genuinely open to new quotes. */
export const QUOTABLE_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.OPEN_FOR_QUOTES,
  LeadStatus.QUOTED,
]

export function isQuotable(status: LeadStatus): boolean {
  return QUOTABLE_LEAD_STATUSES.includes(status)
}

/** Jobs a customer can still be asked to review. */
export function isReviewable(status: JobStatus): boolean {
  return status === JobStatus.COMPLETED
}

export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.ACCEPTED,
  JobStatus.AWAITING_PAYMENT,
  JobStatus.SCHEDULED,
  JobStatus.IN_PROGRESS,
]

/**
 * Which status a given actor is allowed to move a job to.
 *
 * Deliberately asymmetric: a worker can say "I've started" and "I'm
 * done", but only a customer can cancel outright, and neither side can
 * unilaterally declare a dispute resolved. Encoding this as data rather
 * than scattered `if` statements means the job page can render exactly
 * the buttons a person is allowed to press.
 */
export type JobActor = 'customer' | 'worker' | 'admin'

const TRANSITIONS: Record<JobActor, Partial<Record<JobStatus, JobStatus[]>>> = {
  worker: {
    [JobStatus.ACCEPTED]: [JobStatus.SCHEDULED],
    [JobStatus.SCHEDULED]: [JobStatus.IN_PROGRESS],
    [JobStatus.IN_PROGRESS]: [JobStatus.COMPLETED],
  },
  customer: {
    [JobStatus.ACCEPTED]: [JobStatus.CANCELLED, JobStatus.DISPUTED],
    [JobStatus.SCHEDULED]: [JobStatus.CANCELLED, JobStatus.DISPUTED],
    [JobStatus.IN_PROGRESS]: [JobStatus.DISPUTED],
    [JobStatus.COMPLETED]: [JobStatus.DISPUTED],
  },
  admin: {
    [JobStatus.ACCEPTED]: [JobStatus.SCHEDULED, JobStatus.CANCELLED, JobStatus.DISPUTED],
    [JobStatus.SCHEDULED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED, JobStatus.DISPUTED],
    [JobStatus.IN_PROGRESS]: [JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.DISPUTED],
    [JobStatus.COMPLETED]: [JobStatus.DISPUTED],
    [JobStatus.DISPUTED]: [JobStatus.COMPLETED, JobStatus.CANCELLED],
  },
}

export function allowedTransitions(actor: JobActor, from: JobStatus): JobStatus[] {
  return TRANSITIONS[actor][from] ?? []
}

export function canTransition(actor: JobActor, from: JobStatus, to: JobStatus): boolean {
  return allowedTransitions(actor, from).includes(to)
}

export function jobActorFor(
  job: { customerId: string | null; workerId: string | null },
  userId: string,
  isAdmin: boolean
): JobActor | null {
  if (job.customerId === userId) return 'customer'
  if (job.workerId === userId) return 'worker'
  if (isAdmin) return 'admin'
  return null
}

/**
 * Accepting a quote — the single most consequential action in the
 * marketplace, so it happens in one transaction:
 *
 *  1. the accepted quote is marked ACCEPTED
 *  2. every other quote on that lead is DECLINED (a customer cannot
 *     accidentally hire two people for one job)
 *  3. the lead moves to ASSIGNED and stops accepting quotes
 *  4. a Job is created
 *  5. a Transaction records the agreed split, with the commission rate
 *     snapshotted so a later rate change cannot rewrite this job's terms
 *
 * If any step fails, none of them happened.
 */
export async function acceptQuote(quoteId: string, acceptingUserId: string) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { lead: true },
    })

    if (!quote) return { error: 'Quote not found.' as const }
    if (quote.lead.customerId !== acceptingUserId) return { error: 'Quote not found.' as const }
    if (quote.status !== QuoteStatus.PENDING) return { error: 'That quote is no longer open.' as const }
    if (!isQuotable(quote.lead.status)) return { error: 'This request is no longer accepting quotes.' as const }

    await tx.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.ACCEPTED, respondedAt: new Date() },
    })

    // Read the losing quotes before declining them: after the update
    // there is no way to tell which ones this acceptance closed.
    const declined = await tx.quote.findMany({
      where: { leadId: quote.leadId, id: { not: quote.id }, status: QuoteStatus.PENDING },
      select: { workerId: true },
    })

    await tx.quote.updateMany({
      where: { leadId: quote.leadId, id: { not: quote.id }, status: QuoteStatus.PENDING },
      data: { status: QuoteStatus.DECLINED, respondedAt: new Date() },
    })

    await tx.lead.update({
      where: { id: quote.leadId },
      data: { status: LeadStatus.ASSIGNED, assignedUserId: quote.workerId },
    })

    const job = await tx.job.create({
      data: {
        reference: makeReference('JOB'),
        leadId: quote.leadId,
        quoteId: quote.id,
        customerId: quote.lead.customerId,
        workerId: quote.workerId,
        modelId: quote.lead.modelId,
        description: quote.lead.message,
        status: JobStatus.ACCEPTED,
        agreedPriceCents: quote.amountCents,
        currency: quote.currency,
      },
    })

    await tx.jobStatusEvent.create({
      data: {
        jobId: job.id,
        fromStatus: null,
        toStatus: JobStatus.ACCEPTED,
        actorId: acceptingUserId,
        note: 'Quote accepted by the customer.',
      },
    })

    const commissionRateBps = await commissionBpsForWorker(quote.workerId)
    const split = calculateSplit(quote.amountCents, commissionRateBps)
    await tx.transaction.create({
      data: {
        reference: makeReference('TXN'),
        jobId: job.id,
        customerId: quote.lead.customerId,
        workerId: quote.workerId,
        grossCents: split.grossCents,
        commissionRateBps: split.commissionRateBps,
        commissionCents: split.commissionCents,
        workerPayoutCents: split.workerPayoutCents,
        currency: quote.currency,
        // No payment provider is connected, so this records the agreed
        // split and stops. It is never marked PAID by anything other
        // than a real provider webhook.
        status: 'PENDING',
      },
    })

    await notify(
      {
        userId: quote.workerId,
        type: NotificationType.QUOTE_ACCEPTED,
        title: 'Your quote was accepted',
        body: `You have been hired for "${quote.lead.title ?? quote.lead.reference}" at ${formatMoney(quote.amountCents, quote.currency)}. Contact details are on the job.`,
        href: `/jobs/${job.id}`,
      },
      tx
    )

    // Losing a job is worth being told about too: a technician holding a
    // slot open for a quote that has already gone elsewhere is the thing
    // this prevents.
    for (const loser of declined) {
      await notify(
        {
          userId: loser.workerId,
          type: NotificationType.QUOTE_DECLINED,
          title: 'A quote was not taken up',
          body: `The customer hired someone else for "${quote.lead.title ?? quote.lead.reference}".`,
          href: '/leads',
        },
        tx
      )
    }

    return { job }
  })
}

/**
 * Recomputes a worker's cached rating from their reviews. Called after
 * a review is written rather than trusted to drift — the cache exists
 * for list performance, so it has to be derived, never incremented by
 * hand.
 */
export async function recomputeWorkerRating(workerUserId: string, tx: Prisma.TransactionClient = prisma) {
  const aggregate = await tx.workerReview.aggregate({
    where: { workerId: workerUserId },
    _avg: { rating: true },
    _count: true,
  })

  const completed = await tx.job.count({
    where: { workerId: workerUserId, status: JobStatus.COMPLETED },
  })

  await tx.technicianProfile.updateMany({
    where: { userId: workerUserId },
    data: {
      ratingAvg: aggregate._avg.rating,
      ratingCount: aggregate._count,
      jobsCompleted: completed,
    },
  })
}

/**
 * How well an open request lines up with what a technician has said they
 * do and where they go.
 *
 * This is ordinary set membership against the postcodes and service
 * categories a technician typed into their own profile — not a model, not
 * a prediction, and it is described to them in exactly those terms. The
 * board still shows every open job; matching changes the order and adds a
 * label, it never hides work from someone.
 */
export interface LeadMatch {
  areaMatch: boolean
  serviceMatch: boolean
  /** Higher sorts first. Area is weighted above service because driving
   *  three hours to a job you are qualified for is still not a job you
   *  will take. */
  score: number
  reasons: string[]
}

export function matchLead(
  lead: { postcode: string | null; serviceCategoryId: string | null },
  profile: { postcodes: Set<string>; categoryIds: Set<string> } | null
): LeadMatch {
  if (!profile) return { areaMatch: false, serviceMatch: false, score: 0, reasons: [] }

  const areaMatch = Boolean(lead.postcode && profile.postcodes.has(lead.postcode))
  const serviceMatch = Boolean(lead.serviceCategoryId && profile.categoryIds.has(lead.serviceCategoryId))

  const reasons: string[] = []
  if (areaMatch) reasons.push('in an area you cover')
  if (serviceMatch) reasons.push('a service you offer')

  return {
    areaMatch,
    serviceMatch,
    score: (areaMatch ? 2 : 0) + (serviceMatch ? 1 : 0),
    reasons,
  }
}
