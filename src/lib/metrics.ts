import 'server-only'

import { JobStatus, PayoutStatus, Role, TransactionStatus } from '@prisma/client'
import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import { ACTIVE_JOB_STATUSES, QUOTABLE_LEAD_STATUSES } from './marketplace'
import { ACTIVE_SUBSCRIPTION_STATUSES } from './entitlements'

/**
 * Platform metrics.
 *
 * Every figure here is counted from the database at request time. The
 * brief asks for real data architecture rather than fake permanent
 * numbers, and the way that goes wrong is not usually someone typing
 * "1,284 users" into a template — it is a dashboard that keeps showing a
 * confident number after the thing it counts has stopped being
 * countable. So each figure is either read or reported as unavailable;
 * there are no defaults standing in for a query that failed.
 *
 * The money figures carry a distinction the UI has to preserve:
 * **recorded** is the split Doorlink wrote down when a job was agreed,
 * **collected** is money a payment provider has confirmed. With no
 * provider connected the second is always zero, and that is the true
 * answer rather than a broken one.
 */

export interface PlatformMetrics {
  users: { total: number; customers: number; technicians: number; admins: number }
  workers: { withProfiles: number; verified: number; acceptingWork: number }
  marketplace: {
    leadsTotal: number
    leadsOpen: number
    quotesTotal: number
    jobsActive: number
    jobsCompleted: number
    jobsDisputed: number
  }
  money: {
    /** Gross value of every job that reached completion, recorded. */
    recordedGmvCents: number
    /** Doorlink's share of that, recorded. */
    recordedCommissionCents: number
    /** Gross a provider has actually confirmed. Zero until one exists. */
    collectedGmvCents: number
    collectedCommissionCents: number
    paidOutCents: number
    owedToWorkersCents: number
  }
  subscriptions: { active: number; total: number }
  community: { reviews: number; averageRating: number | null; openReports: number; openDisputes: number }
}

export async function platformMetrics(): Promise<PlatformMetrics | null> {
  try {
    const [
      users,
      customers,
      technicians,
      admins,
      workerProfiles,
      verifiedWorkers,
      acceptingWork,
      leadsTotal,
      leadsOpen,
      quotesTotal,
      jobsActive,
      jobsCompleted,
      jobsDisputed,
      recorded,
      collected,
      paidOut,
      owed,
      subscriptionsActive,
      subscriptionsTotal,
      reviews,
      openReports,
      openDisputes,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: Role.CUSTOMER } }),
      prisma.user.count({ where: { role: Role.TECHNICIAN } }),
      prisma.user.count({ where: { role: Role.ADMIN } }),
      prisma.technicianProfile.count(),
      prisma.technicianProfile.count({ where: { verified: true } }),
      prisma.technicianProfile.count({ where: { acceptingWork: true } }),
      prisma.lead.count(),
      prisma.lead.count({ where: { status: { in: QUOTABLE_LEAD_STATUSES } } }),
      prisma.quote.count(),
      prisma.job.count({ where: { status: { in: ACTIVE_JOB_STATUSES } } }),
      prisma.job.count({ where: { status: JobStatus.COMPLETED } }),
      prisma.job.count({ where: { status: JobStatus.DISPUTED } }),
      prisma.transaction.aggregate({
        where: { job: { status: JobStatus.COMPLETED } },
        _sum: { grossCents: true, commissionCents: true },
      }),
      prisma.transaction.aggregate({
        where: { status: TransactionStatus.PAID },
        _sum: { grossCents: true, commissionCents: true },
      }),
      prisma.payout.aggregate({
        where: { status: PayoutStatus.PAID },
        _sum: { amountCents: true },
      }),
      prisma.payout.aggregate({
        where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.SCHEDULED] } },
        _sum: { amountCents: true },
      }),
      prisma.subscription.count({ where: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES } } }),
      prisma.subscription.count(),
      prisma.workerReview.aggregate({ _count: true, _avg: { rating: true } }),
      prisma.report.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    ])

    return {
      users: { total: users, customers, technicians, admins },
      workers: { withProfiles: workerProfiles, verified: verifiedWorkers, acceptingWork },
      marketplace: {
        leadsTotal,
        leadsOpen,
        quotesTotal,
        jobsActive,
        jobsCompleted,
        jobsDisputed,
      },
      money: {
        recordedGmvCents: recorded._sum.grossCents ?? 0,
        recordedCommissionCents: recorded._sum.commissionCents ?? 0,
        collectedGmvCents: collected._sum.grossCents ?? 0,
        collectedCommissionCents: collected._sum.commissionCents ?? 0,
        paidOutCents: paidOut._sum.amountCents ?? 0,
        owedToWorkersCents: owed._sum.amountCents ?? 0,
      },
      subscriptions: { active: subscriptionsActive, total: subscriptionsTotal },
      community: {
        reviews: reviews._count,
        // Null, not zero. No reviews is not an average of nought.
        averageRating: reviews._count > 0 ? (reviews._avg.rating ?? null) : null,
        openReports,
        openDisputes,
      },
    }
  } catch (error) {
    // Null means "could not be read", which the page renders as such.
    // Returning zeros here would put a confident number on screen for
    // something nobody counted.
    if (isDatabaseUnreachable(error)) return null
    throw error
  }
}
