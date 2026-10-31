import 'server-only'

import { JobStatus, TransactionStatus } from '@prisma/client'
import { prisma } from './prisma'

/**
 * The design → quote → booking → payment funnel and the money behind it,
 * counted from real rows. Nothing here is estimated or sampled.
 */
export async function marketplaceAnalytics() {
  const since30 = new Date(Date.now() - 30 * 86_400_000)
  const quoteJobs = { automatedQuote: { isNot: null } } as const
  const paidStatuses = [TransactionStatus.PAID, TransactionStatus.PARTIALLY_REFUNDED, TransactionStatus.REFUNDED]

  const [
    businessesApproved,
    businessesPending,
    businessesSuspended,
    activeCustomers,
    designsSaved,
    aiImages,
    comparisons,
    comparisonsWithBooking,
    quotesIssued,
    customRequests,
    jobsRequested,
    jobsConfirmed,
    jobsCompleted,
    jobsDeclined,
    jobsDisputed,
    paid,
    disputesOpen,
    ratings,
    aiSpend,
    commissionUncollected,
  ] = await Promise.all([
    prisma.businessProfile.count({ where: { status: 'APPROVED' } }),
    prisma.businessProfile.count({ where: { status: 'PENDING' } }),
    prisma.businessProfile.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count({
      where: {
        role: 'CUSTOMER',
        OR: [{ quotesRequested: { some: { createdAt: { gte: since30 } } } }, { jobs: { some: { createdAt: { gte: since30 } } } }],
      },
    }),
    prisma.doorConfiguration.count(),
    prisma.aiGeneration.count({ where: { status: 'SUCCEEDED' } }),
    prisma.quoteComparison.count(),
    prisma.quoteComparison.count({ where: { quotes: { some: { status: 'BOOKED' } } } }),
    prisma.automatedQuote.count({ where: { options: { some: {} } } }),
    prisma.automatedQuote.count({ where: { customMessage: { not: null } } }),
    prisma.job.count({ where: quoteJobs }),
    prisma.job.count({
      where: {
        ...quoteJobs,
        status: {
          in: [
            JobStatus.AWAITING_PAYMENT,
            JobStatus.ACCEPTED,
            JobStatus.PAYMENT_CONFIRMED,
            JobStatus.SCHEDULED,
            JobStatus.IN_PROGRESS,
            JobStatus.BUSINESS_COMPLETED,
            JobStatus.COMPLETED,
          ],
        },
      },
    }),
    prisma.job.count({ where: { ...quoteJobs, status: JobStatus.COMPLETED } }),
    prisma.job.count({ where: { ...quoteJobs, status: JobStatus.DECLINED } }),
    prisma.job.count({ where: { status: JobStatus.DISPUTED } }),
    prisma.transaction.aggregate({
      where: { status: { in: paidStatuses }, stripeAccountId: { not: null } },
      _sum: { grossCents: true, commissionCents: true, processingFeeCents: true, refundedCents: true },
      _count: { _all: true },
    }),
    prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.workerReview.aggregate({ where: { status: 'PUBLISHED' }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.aiGeneration.aggregate({ _sum: { costCents: true } }),
    // Fees on jobs paid directly to the business: recorded, settled outside Stripe.
    prisma.transaction.aggregate({
      where: { stripeAccountId: null, kind: { in: ['FULL', 'DEPOSIT', 'BALANCE'] }, job: { status: JobStatus.COMPLETED, automatedQuote: { isNot: null } } },
      _sum: { commissionCents: true },
    }),
  ])

  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)

  return {
    businesses: { approved: businessesApproved, pending: businessesPending, suspended: businessesSuspended },
    activeCustomers,
    designsSaved,
    aiImages,
    comparisons,
    quotesIssued,
    customRequests,
    jobs: { requested: jobsRequested, confirmed: jobsConfirmed, completed: jobsCompleted, declined: jobsDeclined, disputed: jobsDisputed },
    money: {
      payments: paid._count._all,
      grossCents: paid._sum.grossCents ?? 0,
      commissionCents: paid._sum.commissionCents ?? 0,
      processingFeeCents: paid._sum.processingFeeCents ?? 0,
      refundedCents: paid._sum.refundedCents ?? 0,
      commissionDirectCents: commissionUncollected._sum.commissionCents ?? 0,
      aiSpendCents: aiSpend._sum.costCents ?? 0,
    },
    disputesOpen,
    ratings: { average: ratings._avg.rating, count: ratings._count._all },
    conversion: {
      comparisonToBooking: pct(comparisonsWithBooking, comparisons),
      bookingToConfirmed: pct(jobsConfirmed, jobsRequested),
      confirmedToCompleted: pct(jobsCompleted, jobsConfirmed),
    },
  }
}

/** Per-business performance for the admin table. */
export async function businessPerformance() {
  const profiles = await prisma.businessProfile.findMany({ where: { status: 'APPROVED' }, select: { businessKey: true, organizationId: true, userId: true } })
  return Promise.all(
    profiles.map(async (profile) => {
      const quoteWhere = profile.organizationId
        ? { businessOrganizationId: profile.organizationId }
        : { businessUserId: profile.userId!, businessOrganizationId: null }
      const [quotes, booked, completed, revenue] = await Promise.all([
        prisma.automatedQuote.count({ where: { ...quoteWhere, options: { some: {} } } }),
        prisma.automatedQuote.count({ where: { ...quoteWhere, status: 'BOOKED' } }),
        prisma.job.count({ where: { automatedQuote: quoteWhere, status: JobStatus.COMPLETED } }),
        prisma.transaction.aggregate({
          where: { job: { automatedQuote: quoteWhere }, status: { in: [TransactionStatus.PAID, TransactionStatus.PARTIALLY_REFUNDED] } },
          _sum: { grossCents: true, commissionCents: true },
        }),
      ])
      return {
        businessKey: profile.businessKey,
        quotes,
        booked,
        completed,
        grossCents: revenue._sum.grossCents ?? 0,
        commissionCents: revenue._sum.commissionCents ?? 0,
      }
    })
  )
}
