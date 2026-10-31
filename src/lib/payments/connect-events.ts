import 'server-only'

import { JobStatus, NotificationType, Prisma } from '@prisma/client'
import type Stripe from 'stripe'
import { notify } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { accountState } from './connect'
import {
  applyCheckoutCompleted,
  applyCheckoutExpired,
  applyConnectPaymentFailed,
  applyRefundTotal,
} from './job-payments'

/**
 * Applies one verified Stripe Connect event. Each event id is recorded,
 * and an event already processed is skipped, so Stripe's retries are
 * harmless. Throwing makes the route answer 500 and Stripe retry.
 */
export async function handleConnectEvent(event: Stripe.Event): Promise<'applied' | 'duplicate' | 'ignored'> {
  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: 'stripe-connect', externalId: event.id } },
  })
  if (existing?.processedAt) return 'duplicate'
  if (!existing) {
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: 'stripe-connect',
          externalId: event.id,
          payload: { type: event.type, account: event.account ?? null } as Prisma.InputJsonValue,
        },
      })
    } catch (error) {
      // Another delivery of the same event got here first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'duplicate'
      throw error
    }
  }

  const applied = await apply(event)
  await prisma.webhookEvent.update({
    where: { provider_externalId: { provider: 'stripe-connect', externalId: event.id } },
    data: { processedAt: new Date() },
  })
  return applied ? 'applied' : 'ignored'
}

async function apply(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      const state = accountState(account)
      await prisma.businessProfile.updateMany({
        where: { stripeAccountId: account.id },
        data: {
          stripeChargesEnabled: state.chargesEnabled,
          stripePayoutsEnabled: state.payoutsEnabled,
          stripeDetailsSubmitted: state.detailsSubmitted,
          stripeUpdatedAt: new Date(),
        },
      })
      return true
    }
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session
      const result = await applyCheckoutCompleted({
        sessionId: session.id,
        accountId: event.account ?? null,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null),
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        transactionId: session.metadata?.transactionId ?? null,
      })
      if (!result.ok && result.reason !== 'not_paid') console.error('Checkout not applied', event.id, result.reason)
      return result.ok
    }
    case 'checkout.session.expired': {
      await applyCheckoutExpired((event.data.object as Stripe.Checkout.Session).id)
      return true
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session
      const intent = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? '')
      await applyConnectPaymentFailed(intent, session.metadata?.transactionId ?? null, 'The payment did not go through.')
      return true
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent
      await applyConnectPaymentFailed(
        intent.id,
        intent.metadata?.transactionId ?? null,
        intent.last_payment_error?.message ?? 'The payment was declined.'
      )
      return true
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (!intent) return false
      await applyRefundTotal(intent, charge.amount_refunded)
      return true
    }
    case 'charge.dispute.created': {
      // A card chargeback: the job is marked disputed so an admin looks at it.
      const dispute = event.data.object as Stripe.Dispute
      const intent = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
      if (!intent) return false
      const transaction = await prisma.transaction.findFirst({ where: { providerRef: intent }, include: { job: true } })
      const job = transaction?.job
      if (!job || !job.customerId) return false
      await prisma.$transaction(async (tx) => {
        if (job.status !== JobStatus.DISPUTED) {
          await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.DISPUTED } })
          await tx.jobStatusEvent.create({
            data: { jobId: job.id, fromStatus: job.status, toStatus: JobStatus.DISPUTED, note: 'Card dispute opened with the bank.' },
          })
        }
        await tx.dispute.create({
          data: { jobId: job.id, raisedById: job.customerId!, reason: 'Card chargeback', detail: `Stripe dispute ${dispute.id}: ${dispute.reason}` },
        })
        if (job.workerId)
          await notify(
            {
              userId: job.workerId,
              type: NotificationType.PAYMENT_STATUS,
              title: `Card dispute on job ${job.reference}`,
              body: 'The customer’s bank opened a dispute. Respond to it from your Stripe dashboard.',
              href: `/jobs/${job.id}`,
            },
            tx
          )
      })
      return true
    }
    default:
      return false
  }
}
