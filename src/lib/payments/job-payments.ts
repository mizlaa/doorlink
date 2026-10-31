import 'server-only'

import { JobStatus, NotificationType, PaymentKind, Prisma, TransactionStatus } from '@prisma/client'
import { calculateBasedSplit, proportionalBase } from '@/lib/commission'
import { commissionBpsForWorker } from '@/lib/commission-settings'
import { splitDeposit } from '@/lib/business/deposit'
import { formatMoney } from '@/lib/money'
import { notify } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { makeReference } from '@/lib/reference'
import { createJobCheckout, processingFeeFor, refundJobPayment } from './connect'

/**
 * Money on a marketplace job: what is due, taking it through Stripe, and
 * recording what Stripe confirms. Nothing here marks a payment as paid
 * except a verified Stripe event (see the Connect webhook), and every
 * write is idempotent so a retried event changes nothing twice.
 */

type Tx = Prisma.TransactionClient

/**
 * The payments due on a job once the business confirms it: one in full,
 * or a deposit now and the balance when the work is finished. Doorlink's
 * fee is worked on the ex-GST part of each payment and recorded on it.
 */
export async function createJobTransactions(
  tx: Tx,
  job: {
    id: string
    customerId: string | null
    workerId: string | null
    agreedPriceCents: number
    agreedExGstCents: number | null
    currency: string
    depositPercent: number
  },
  stripeAccountId: string | null
) {
  const bps = job.workerId ? await commissionBpsForWorker(job.workerId) : 0
  const base = job.agreedExGstCents ?? job.agreedPriceCents
  const { depositCents, balanceCents } = splitDeposit(job.agreedPriceCents, job.depositPercent)
  const parts: Array<{ kind: PaymentKind; gross: number }> =
    balanceCents > 0
      ? [
          { kind: PaymentKind.DEPOSIT, gross: depositCents },
          { kind: PaymentKind.BALANCE, gross: balanceCents },
        ]
      : [{ kind: PaymentKind.FULL, gross: depositCents }]

  let baseLeft = base
  for (const [index, part] of parts.entries()) {
    // The last part takes whatever base is left, so the parts add up exactly.
    const partBase =
      index === parts.length - 1 ? baseLeft : proportionalBase(base, job.agreedPriceCents, part.gross)
    baseLeft -= partBase
    const split = calculateBasedSplit(part.gross, partBase, bps)
    await tx.transaction.create({
      data: {
        reference: makeReference('TXN'),
        jobId: job.id,
        customerId: job.customerId,
        workerId: job.workerId,
        kind: part.kind,
        grossCents: split.grossCents,
        commissionBaseCents: partBase,
        commissionRateBps: split.commissionRateBps,
        commissionCents: split.commissionCents,
        workerPayoutCents: split.workerPayoutCents,
        currency: job.currency,
        stripeAccountId,
        status: TransactionStatus.PENDING,
      },
    })
  }
}

export async function outstandingPayment(jobId: string, kind: 'upfront' | 'balance') {
  return prisma.transaction.findFirst({
    where: {
      jobId,
      kind: kind === 'upfront' ? { in: [PaymentKind.FULL, PaymentKind.DEPOSIT] } : PaymentKind.BALANCE,
      status: { in: [TransactionStatus.PENDING, TransactionStatus.REQUIRES_ACTION, TransactionStatus.FAILED] },
    },
  })
}

/** Starts (or restarts) Stripe Checkout for a pending payment. Returns the URL to send the customer to. */
export async function startCheckout(input: {
  transactionId: string
  jobId: string
  jobReference: string
  description: string
  customerEmail: string | null
  siteUrl: string
}): Promise<string> {
  const transaction = await prisma.transaction.findUnique({ where: { id: input.transactionId } })
  if (!transaction || !transaction.stripeAccountId) throw new Error('payment not found')
  if (transaction.status === TransactionStatus.PAID) throw new Error('already paid')

  const session = await createJobCheckout({
    accountId: transaction.stripeAccountId,
    transactionId: transaction.id,
    jobId: input.jobId,
    amountCents: transaction.grossCents,
    applicationFeeCents: transaction.commissionCents,
    currency: transaction.currency,
    description: input.description,
    customerEmail: input.customerEmail,
    successUrl: `${input.siteUrl}/jobs/${input.jobId}?paid=1`,
    cancelUrl: `${input.siteUrl}/jobs/${input.jobId}?payment=cancelled`,
  })
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.REQUIRES_ACTION,
        provider: 'stripe',
        checkoutSessionId: session.id,
        failureReason: null,
      },
    }),
    prisma.transactionEvent.create({
      data: {
        transactionId: transaction.id,
        type: TransactionStatus.REQUIRES_ACTION,
        note: 'Checkout started.',
        payload: { checkoutSessionId: session.id },
      },
    }),
  ])
  return session.url
}

export interface CheckoutCompletion {
  sessionId: string
  accountId: string | null
  paymentIntentId: string | null
  paymentStatus: string
  amountTotal: number | null
  transactionId: string | null
}

/**
 * Stripe says a checkout finished. Checked against our record (same
 * account, same amount, actually paid) before anything changes; the job
 * moves on, and both sides are told.
 */
export async function applyCheckoutCompleted(event: CheckoutCompletion) {
  if (event.paymentStatus !== 'paid' || !event.paymentIntentId) return { ok: false as const, reason: 'not_paid' }

  const transaction = await prisma.transaction.findFirst({
    where: event.transactionId ? { id: event.transactionId } : { checkoutSessionId: event.sessionId },
    include: { job: true },
  })
  if (!transaction) return { ok: false as const, reason: 'unknown' }
  if (transaction.status === TransactionStatus.PAID) return { ok: true as const, alreadyApplied: true }
  if (transaction.stripeAccountId !== event.accountId) return { ok: false as const, reason: 'account_mismatch' }
  if (event.amountTotal !== transaction.grossCents) return { ok: false as const, reason: 'amount_mismatch' }

  const fee = await processingFeeFor(event.accountId!, event.paymentIntentId).catch(() => null)
  const job = transaction.job

  await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction: two deliveries of one event must not both apply.
    const fresh = await tx.transaction.findUnique({ where: { id: transaction.id }, select: { status: true } })
    if (fresh?.status === TransactionStatus.PAID) return
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.PAID,
        paidAt: new Date(),
        providerRef: event.paymentIntentId,
        processingFeeCents: fee,
        failureReason: null,
      },
    })
    await tx.transactionEvent.create({
      data: {
        transactionId: transaction.id,
        type: TransactionStatus.PAID,
        note: 'Stripe confirmed payment.',
        amountCents: transaction.grossCents,
        payload: { paymentIntentId: event.paymentIntentId, processingFeeCents: fee },
      },
    })
    if (!job) return

    const amount = formatMoney(transaction.grossCents, transaction.currency)
    if (transaction.kind !== PaymentKind.BALANCE && job.status === JobStatus.AWAITING_PAYMENT) {
      await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.PAYMENT_CONFIRMED } })
      await tx.jobStatusEvent.create({
        data: {
          jobId: job.id,
          fromStatus: job.status,
          toStatus: JobStatus.PAYMENT_CONFIRMED,
          note: `${transaction.kind === PaymentKind.DEPOSIT ? 'Deposit' : 'Payment'} of ${amount} confirmed by Stripe.`,
        },
      })
    }
    const label = transaction.kind === PaymentKind.BALANCE ? 'balance' : transaction.kind === PaymentKind.DEPOSIT ? 'deposit' : 'payment'
    if (job.customerId)
      await notify(
        {
          userId: job.customerId,
          type: NotificationType.PAYMENT_STATUS,
          title: `Your ${label} is confirmed`,
          body: `${amount} for job ${job.reference} went through.`,
          href: `/jobs/${job.id}`,
        },
        tx
      )
    if (job.workerId)
      await notify(
        {
          userId: job.workerId,
          type: NotificationType.PAYMENT_STATUS,
          title: `Payment confirmed: job ${job.reference}`,
          body: `The customer paid the ${label}, ${amount}.${transaction.kind === PaymentKind.BALANCE ? '' : ' Book a time with them.'}`,
          href: `/jobs/${job.id}`,
        },
        tx
      )
  })
  return { ok: true as const, alreadyApplied: false }
}

/** A checkout that expired or was abandoned: the payment can be started again. */
export async function applyCheckoutExpired(sessionId: string) {
  await prisma.transaction.updateMany({
    where: { checkoutSessionId: sessionId, status: TransactionStatus.REQUIRES_ACTION },
    data: { status: TransactionStatus.PENDING },
  })
}

export async function applyConnectPaymentFailed(paymentIntentId: string, transactionId: string | null, reason: string) {
  const transaction = await prisma.transaction.findFirst({
    where: transactionId ? { id: transactionId } : { providerRef: paymentIntentId },
  })
  if (!transaction || transaction.status === TransactionStatus.PAID) return
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.FAILED, failureReason: reason },
    }),
    prisma.transactionEvent.create({
      data: { transactionId: transaction.id, type: TransactionStatus.FAILED, note: reason },
    }),
  ])
}

/**
 * Stripe reports the *total* refunded on a charge each time, so the
 * ledger is set to that total rather than added to — a retried or
 * repeated event can't double count.
 */
export async function applyRefundTotal(paymentIntentId: string, totalRefundedCents: number) {
  const transaction = await prisma.transaction.findFirst({ where: { providerRef: paymentIntentId } })
  if (!transaction || totalRefundedCents <= transaction.refundedCents) return
  const status =
    totalRefundedCents >= transaction.grossCents ? TransactionStatus.REFUNDED : TransactionStatus.PARTIALLY_REFUNDED
  await prisma.$transaction([
    prisma.transaction.update({ where: { id: transaction.id }, data: { refundedCents: totalRefundedCents, status } }),
    prisma.transactionEvent.create({
      data: {
        transactionId: transaction.id,
        type: status,
        note: 'Stripe confirmed a refund.',
        amountCents: totalRefundedCents - transaction.refundedCents,
      },
    }),
  ])
  if (transaction.customerId && transaction.jobId) {
    await notify({
      userId: transaction.customerId,
      type: NotificationType.PAYMENT_STATUS,
      title: 'Refund issued',
      body: `${formatMoney(totalRefundedCents - transaction.refundedCents, transaction.currency)} is on its way back to your card.`,
      href: `/jobs/${transaction.jobId}`,
    })
  }
}

/**
 * Asks Stripe to refund everything paid on a job (a business cancelling,
 * or an admin resolving a dispute). The ledger changes when Stripe
 * confirms the refund, not here. Returns how many payments were sent for
 * refund.
 */
export async function refundJob(jobId: string, reason: string): Promise<number> {
  const paid = await prisma.transaction.findMany({
    where: { jobId, status: { in: [TransactionStatus.PAID, TransactionStatus.PARTIALLY_REFUNDED] }, providerRef: { not: null } },
  })
  let sent = 0
  for (const transaction of paid) {
    if (!transaction.stripeAccountId || !transaction.providerRef) continue
    const remaining = transaction.grossCents - transaction.refundedCents
    if (remaining <= 0) continue
    await refundJobPayment({
      accountId: transaction.stripeAccountId,
      paymentIntentId: transaction.providerRef,
      amountCents: remaining,
      idempotencyKey: `refund-${transaction.id}-${transaction.refundedCents}`,
    })
    await prisma.transactionEvent.create({
      data: { transactionId: transaction.id, type: transaction.status, note: `Refund requested: ${reason}`, amountCents: remaining },
    })
    sent++
  }
  return sent
}

/** Whether anything has been paid on the job through Doorlink. */
export async function jobHasOnlinePayment(jobId: string): Promise<boolean> {
  return (
    (await prisma.transaction.count({
      where: { jobId, status: { in: [TransactionStatus.PAID, TransactionStatus.PARTIALLY_REFUNDED] } },
    })) > 0
  )
}
