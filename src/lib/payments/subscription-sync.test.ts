import { describe, expect, it } from 'vitest'
import { SubscriptionStatus } from '@prisma/client'
import { mapStripeSubscriptionStatus, willCancelAtPeriodEnd } from './subscription-sync'

describe('mapStripeSubscriptionStatus', () => {
  it('maps known Stripe statuses explicitly', () => {
    expect(mapStripeSubscriptionStatus('active')).toBe(SubscriptionStatus.ACTIVE)
    expect(mapStripeSubscriptionStatus('trialing')).toBe(SubscriptionStatus.TRIALING)
    expect(mapStripeSubscriptionStatus('past_due')).toBe(SubscriptionStatus.PAST_DUE)
    expect(mapStripeSubscriptionStatus('canceled')).toBe(SubscriptionStatus.CANCELLED)
    expect(mapStripeSubscriptionStatus('incomplete')).toBe(SubscriptionStatus.INCOMPLETE)
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe(SubscriptionStatus.EXPIRED)
    expect(mapStripeSubscriptionStatus('unpaid')).toBe(SubscriptionStatus.EXPIRED)
  })

  it('does not treat unknown statuses as active', () => {
    expect(mapStripeSubscriptionStatus('paused')).toBe(SubscriptionStatus.INCOMPLETE)
  })
})

describe('willCancelAtPeriodEnd', () => {
  it('treats cancel_at as a scheduled cancellation when status stays active', () => {
    expect(
      willCancelAtPeriodEnd({ status: 'active', cancel_at_period_end: false, cancel_at: 1_700_000_000 })
    ).toBe(true)
    expect(willCancelAtPeriodEnd({ status: 'active', cancel_at_period_end: true, cancel_at: null })).toBe(
      true
    )
  })

  it('does not mark a fully canceled subscription as ending later', () => {
    expect(
      willCancelAtPeriodEnd({ status: 'canceled', cancel_at_period_end: true, cancel_at: 1_700_000_000 })
    ).toBe(false)
  })
})
