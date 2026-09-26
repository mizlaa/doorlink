import 'server-only'

import type Stripe from 'stripe'
import { SubscriptionStatus } from '@prisma/client'
import { prisma } from '../prisma'
import { getStripeClient } from './stripe'

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.ACTIVE
    case 'trialing':
      return SubscriptionStatus.TRIALING
    case 'past_due':
      return SubscriptionStatus.PAST_DUE
    case 'canceled':
      return SubscriptionStatus.CANCELLED
    case 'incomplete':
      return SubscriptionStatus.INCOMPLETE
    case 'incomplete_expired':
    case 'unpaid':
      return SubscriptionStatus.EXPIRED
    default:
      return SubscriptionStatus.INCOMPLETE
  }
}

function customerId(customer: Stripe.Subscription['customer']): string | null {
  if (typeof customer === 'string') return customer
  return customer?.id ?? null
}

function periodStart(sub: Stripe.Subscription): Date | null {
  const start = (sub as unknown as { current_period_start?: number }).current_period_start
  return typeof start === 'number' ? new Date(start * 1000) : null
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const end = (sub as unknown as { current_period_end?: number }).current_period_end
  return typeof end === 'number' ? new Date(end * 1000) : null
}

function cancelledAt(sub: Stripe.Subscription): Date | null {
  const at = sub.canceled_at ?? sub.cancel_at
  return typeof at === 'number' ? new Date(at * 1000) : null
}

/**
 * Portal cancellation usually leaves status `active` until the period ends.
 * Newer Stripe API versions set `cancel_at` and leave `cancel_at_period_end` false.
 */
export function willCancelAtPeriodEnd(sub: {
  status: string
  cancel_at_period_end?: boolean | null
  cancel_at?: number | null
}): boolean {
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired' || sub.status === 'unpaid') {
    return false
  }
  if (sub.cancel_at_period_end) return true
  return typeof sub.cancel_at === 'number'
}

export async function upsertSubscriptionFromStripe(sub: Stripe.Subscription): Promise<void> {
  const existing =
    sub.metadata.userId && sub.metadata.planId
      ? null
      : await prisma.subscription.findUnique({
          where: { providerSubscriptionId: sub.id },
        })
  const userId = sub.metadata.userId || existing?.userId
  const planId = sub.metadata.planId || existing?.planId
  if (!userId || !planId) {
    console.warn('Stripe subscription missing userId or planId metadata', sub.id)
    return
  }

  const status = mapStripeSubscriptionStatus(sub.status)
  const data = {
    userId,
    planId,
    status,
    provider: 'stripe',
    providerCustomerId: customerId(sub.customer),
    providerSubscriptionId: sub.id,
    currentPeriodStart: periodStart(sub),
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: willCancelAtPeriodEnd(sub),
    cancelledAt: cancelledAt(sub),
  }

  await prisma.subscription.upsert({
    where: { providerSubscriptionId: sub.id },
    create: data,
    update: {
      status: data.status,
      planId: data.planId,
      providerCustomerId: data.providerCustomerId,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      cancelledAt: data.cancelledAt,
    },
  })
}

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null
  if (!subscriptionId) {
    console.warn('checkout.session.completed without subscription id', session.id)
    return
  }

  const stripe = getStripeClient()
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  await upsertSubscriptionFromStripe(sub)
}

export async function handleSubscriptionLifecycle(sub: Stripe.Subscription): Promise<void> {
  await upsertSubscriptionFromStripe(sub)
}

const OPEN_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.INCOMPLETE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
]

/** Pulls the latest Stripe subscription so a portal cancel shows up even if the webhook is late. */
export async function refreshOpenStripeSubscriptions(userId: string): Promise<void> {
  const rows = await prisma.subscription.findMany({
    where: {
      userId,
      provider: 'stripe',
      providerSubscriptionId: { not: null },
      status: { in: OPEN_STATUSES },
    },
  })
  if (rows.length === 0) return

  const stripe = getStripeClient()
  for (const row of rows) {
    if (!row.providerSubscriptionId) continue
    try {
      const sub = await stripe.subscriptions.retrieve(row.providerSubscriptionId)
      await upsertSubscriptionFromStripe(sub)
    } catch (error) {
      console.error('Failed to refresh Stripe subscription', row.providerSubscriptionId, error)
    }
  }
}
