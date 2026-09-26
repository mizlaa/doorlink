import { describe, expect, it, beforeEach, afterEach } from 'vitest'

/**
 * These tests exist for one reason: to make it impossible to
 * accidentally ship a payment provider that reports success without a
 * payment having happened. Every method must refuse while no provider is
 * configured, and the refusal must be the typed error rather than a
 * silently empty result.
 */

const KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('the Stripe adapter', () => {
  it('refuses every operation rather than faking one', async () => {
    const { createStripeProvider } = await import('./stripe')
    const { isPaymentsNotConfigured } = await import('./types')
    const provider = createStripeProvider()

    const calls: Array<Promise<unknown>> = [
      provider.createPaymentIntent({
        amountCents: 50_000,
        currency: 'AUD',
        reference: 'DL-TXN-TEST',
        description: 'test',
        applicationFeeCents: 5_000,
      }),
      provider.refund({ providerIntentId: 'pi_test' }),
      provider.createPayout({
        amountCents: 45_000,
        currency: 'AUD',
        destinationAccountId: 'acct_test',
        reference: 'DL-PAY-TEST',
        description: 'test',
      }),
      provider.createSubscriptionCheckout({
        providerPriceId: 'price_test',
        customerEmail: 'a@example.com',
        userId: 'u1',
        planId: 'plan1',
        successUrl: 'https://example.com/ok',
        cancelUrl: 'https://example.com/no',
      }),
      provider.verifyWebhook('{}', 't=1,v1=deadbeef'),
      provider.createBillingPortalSession({
        providerCustomerId: 'cus_test',
        returnUrl: 'https://example.com/account',
      }),
    ]

    for (const call of calls) {
      await expect(call).rejects.toSatisfy(isPaymentsNotConfigured)
    }
  })

  it('never returns a verified event for an unverifiable webhook', async () => {
    const { createStripeProvider } = await import('./stripe')
    const provider = createStripeProvider()
    await expect(provider.verifyWebhook('{"type":"payment_intent.succeeded"}', 'nonsense')).rejects.toThrow()
  })

  it('still refuses marketplace charges when only the secret key is set', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_not_real'
    const { createStripeProvider } = await import('./stripe')
    const { isPaymentsNotConfigured } = await import('./types')
    const provider = createStripeProvider()

    await expect(
      provider.createPaymentIntent({
        amountCents: 100,
        currency: 'AUD',
        reference: 'x',
        description: 'x',
        applicationFeeCents: 0,
      })
    ).rejects.toSatisfy(isPaymentsNotConfigured)

    await expect(provider.refund({ providerIntentId: 'pi_test' })).rejects.toSatisfy(isPaymentsNotConfigured)

    await expect(
      provider.createPayout({
        amountCents: 100,
        currency: 'AUD',
        destinationAccountId: 'acct_test',
        reference: 'x',
        description: 'x',
      })
    ).rejects.toSatisfy(isPaymentsNotConfigured)
  })

  it('refuses subscription checkout and webhooks without the webhook secret', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_not_real'
    const { createStripeProvider } = await import('./stripe')
    const { isPaymentsNotConfigured } = await import('./types')
    const provider = createStripeProvider()

    await expect(
      provider.createSubscriptionCheckout({
        providerPriceId: 'price_test',
        customerEmail: 'a@example.com',
        userId: 'u1',
        planId: 'plan1',
        successUrl: 'https://example.com/ok',
        cancelUrl: 'https://example.com/no',
      })
    ).rejects.toSatisfy(isPaymentsNotConfigured)

    await expect(provider.verifyWebhook('{}', 't=1,v1=deadbeef')).rejects.toSatisfy(
      isPaymentsNotConfigured
    )

    await expect(
      provider.createBillingPortalSession({
        providerCustomerId: 'cus_test',
        returnUrl: 'https://example.com/account',
      })
    ).rejects.toSatisfy(isPaymentsNotConfigured)
  })
})
