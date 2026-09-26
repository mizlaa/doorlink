import 'server-only'

import Stripe from 'stripe'
import type {
  PaymentIntentRequest,
  PaymentIntentResult,
  PaymentProvider,
  PayoutRequest,
  PayoutResult,
  RefundRequest,
  RefundResult,
  BillingPortalRequest,
  BillingPortalResult,
  SubscriptionCheckoutRequest,
  SubscriptionCheckoutResult,
  VerifiedWebhookEvent,
} from './types'
import { PaymentsNotConfiguredError } from './types'

function secretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY
  return key && key.length > 0 ? key : null
}

function webhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  return secret && secret.length > 0 ? secret : null
}

function notConfigured(action: string): never {
  throw new PaymentsNotConfiguredError(action)
}

/** Shared Stripe client for checkout, webhooks, and subscription sync. */
export function getStripeClient(): Stripe {
  const key = secretKey()
  if (!key) throw new PaymentsNotConfiguredError('call Stripe')
  return new Stripe(key)
}

function subscriptionCheckoutReady(): boolean {
  return !!(secretKey() && webhookSecret())
}

export function createStripeProvider(): PaymentProvider {
  return {
    name: 'stripe',

    async createPaymentIntent(_request: PaymentIntentRequest): Promise<PaymentIntentResult> {
      if (!secretKey()) return notConfigured('take a payment')
      return notConfigured('take a payment')
    },

    async refund(_request: RefundRequest): Promise<RefundResult> {
      if (!secretKey()) return notConfigured('issue a refund')
      return notConfigured('issue a refund')
    },

    async createPayout(_request: PayoutRequest): Promise<PayoutResult> {
      if (!secretKey()) return notConfigured('pay a technician')
      return notConfigured('pay a technician')
    },

    async createSubscriptionCheckout(
      request: SubscriptionCheckoutRequest
    ): Promise<SubscriptionCheckoutResult> {
      if (!subscriptionCheckoutReady()) return notConfigured('start a subscription')

      const stripe = getStripeClient()
      const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
        metadata: {
          userId: request.userId,
          planId: request.planId,
        },
      }
      if (request.trialDays != null && request.trialDays > 0) {
        subscriptionData.trial_period_days = request.trialDays
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: request.providerPriceId, quantity: 1 }],
        customer_email: request.customerEmail,
        client_reference_id: request.userId,
        subscription_data: subscriptionData,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      })

      if (!session.url) {
        throw new Error('Stripe did not return a checkout URL.')
      }

      return { url: session.url, providerSessionId: session.id }
    },

    async createBillingPortalSession(request: BillingPortalRequest): Promise<BillingPortalResult> {
      if (!subscriptionCheckoutReady()) return notConfigured('manage a subscription')

      const stripe = getStripeClient()
      const session = await stripe.billingPortal.sessions.create({
        customer: request.providerCustomerId,
        return_url: request.returnUrl,
      })

      return { url: session.url }
    },

    async verifyWebhook(rawBody: string, signatureHeader: string): Promise<VerifiedWebhookEvent> {
      if (!secretKey()) return notConfigured('verify a webhook')
      const whsec = webhookSecret()
      if (!whsec) return notConfigured('verify a webhook')

      const stripe = getStripeClient()
      const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, whsec)
      return { id: event.id, type: event.type, payload: event }
    },
  }
}
