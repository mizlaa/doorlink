/**
 * Provider-agnostic payment types.
 *
 * Nothing in this file mentions Stripe. The rest of the application talks
 * to these shapes, so swapping or adding a provider is a change inside
 * `src/lib/payments/` and nowhere else — and, more importantly, so that
 * the marketplace keeps working unchanged while no provider is connected
 * at all.
 */

export type Money = {
  /** Integer minor units. Never a float. */
  amountCents: number
  currency: string
}

export interface PaymentIntentRequest extends Money {
  /** Doorlink's own reference for the thing being paid for. */
  reference: string
  description: string
  customerEmail?: string
  /**
   * The share Doorlink keeps. Providers that support split payments use
   * this directly; ones that do not require Doorlink to pay the worker
   * separately, which is what `Payout` records exist for.
   */
  applicationFeeCents: number
  /** The connected account the remainder is destined for, if any. */
  destinationAccountId?: string | null
  metadata?: Record<string, string>
}

export interface PaymentIntentResult {
  providerIntentId: string
  /** What the browser needs to complete the payment, if anything. */
  clientSecret: string | null
  status: 'requires_action' | 'processing' | 'succeeded' | 'failed'
}

export interface RefundRequest {
  providerIntentId: string
  /** Omit to refund the full amount. */
  amountCents?: number
  reason?: string
}

export interface RefundResult {
  providerRefundId: string
  amountCents: number
  status: 'pending' | 'succeeded' | 'failed'
}

export interface PayoutRequest extends Money {
  destinationAccountId: string
  reference: string
  description: string
}

export interface PayoutResult {
  providerPayoutId: string
  status: 'pending' | 'paid' | 'failed'
  arrivesAt: Date | null
}

export interface SubscriptionCheckoutRequest {
  /** The provider's identifier for the price being subscribed to. */
  providerPriceId: string
  customerEmail: string
  /** Doorlink's own user id, echoed back on the webhook. */
  userId: string
  /** Doorlink plan row id — stored on the Stripe subscription metadata. */
  planId: string
  successUrl: string
  cancelUrl: string
  trialDays?: number | null
}

export interface SubscriptionCheckoutResult {
  /** Where to send the browser to complete the subscription. */
  url: string
  providerSessionId: string
}

export interface BillingPortalRequest {
  providerCustomerId: string
  returnUrl: string
}

export interface BillingPortalResult {
  url: string
}

/**
 * A webhook that has already been proved authentic by the provider
 * adapter. Nothing downstream ever sees an unverified payload — the only
 * way to reach the code that marks money as moved is through one of
 * these.
 */
export interface VerifiedWebhookEvent {
  id: string
  type: string
  payload: unknown
}

export interface PaymentProvider {
  readonly name: string
  createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntentResult>
  refund(request: RefundRequest): Promise<RefundResult>
  createPayout(request: PayoutRequest): Promise<PayoutResult>
  createSubscriptionCheckout(request: SubscriptionCheckoutRequest): Promise<SubscriptionCheckoutResult>
  /** Stripe Customer Portal: cancel, update card, view invoices. */
  createBillingPortalSession(request: BillingPortalRequest): Promise<BillingPortalResult>
  /**
   * Verifies a raw webhook body against its signature header. Throws if
   * the signature does not check out — a webhook that cannot be proved
   * to come from the provider is the one thing that must never be
   * trusted, because it is the path that moves money.
   */
  verifyWebhook(rawBody: string, signatureHeader: string): Promise<VerifiedWebhookEvent>
}

/**
 * Thrown by every provider method while no provider is configured.
 *
 * It is a distinct error type rather than a generic one so callers can
 * tell "payments are not set up" apart from "the payment failed", and
 * show the honest message for each.
 */
export class PaymentsNotConfiguredError extends Error {
  readonly code = 'payments_not_configured'

  constructor(action: string) {
    super(
      `Cannot ${action}: no payment provider is connected. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, then restart.`
    )
    this.name = 'PaymentsNotConfiguredError'
  }
}

export function isPaymentsNotConfigured(error: unknown): error is PaymentsNotConfiguredError {
  return error instanceof PaymentsNotConfiguredError
}
