import 'server-only'

import type Stripe from 'stripe'
import { getStripeClient } from './stripe'
import { PaymentsNotConfiguredError } from './types'

/**
 * Stripe Connect for marketplace jobs.
 *
 * Each business has its own Stripe account (a standard account with its
 * own Stripe dashboard). A job payment is a *direct charge* on that
 * account: the business is the seller the customer pays, Stripe's card
 * processing fee comes out of the business's side, and Doorlink's fee is
 * taken as an application fee. Doorlink never holds the money, so nothing
 * here is described as escrow.
 *
 * Stripe only lets a charge be made on an account once Stripe itself
 * has verified it (`charges_enabled`); payouts to the business's bank
 * likewise wait for `payouts_enabled`. Both flags are synced from Stripe
 * and checked before any checkout is created.
 */

export function connectConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

export function connectWebhookConfigured(): boolean {
  return connectConfigured() && !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET
}

export interface AccountState {
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
}

export function accountState(account: Pick<Stripe.Account, 'charges_enabled' | 'payouts_enabled' | 'details_submitted'>): AccountState {
  return {
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
  }
}

export async function createConnectedAccount(input: {
  businessKey: string
  email: string | null
  businessName: string
}): Promise<string> {
  const stripe = getStripeClient()
  const account = await stripe.accounts.create(
    {
      country: 'AU',
      email: input.email ?? undefined,
      business_profile: { name: input.businessName },
      controller: {
        fees: { payer: 'account' },
        losses: { payments: 'stripe' },
        stripe_dashboard: { type: 'full' },
      },
      metadata: { businessKey: input.businessKey },
    },
    // One account per business, even if the button is pressed twice.
    { idempotencyKey: `connect-account-${input.businessKey}` }
  )
  return account.id
}

export async function onboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const stripe = getStripeClient()
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  })
  return link.url
}

export async function retrieveAccountState(accountId: string): Promise<AccountState> {
  const stripe = getStripeClient()
  return accountState(await stripe.accounts.retrieve(accountId))
}

export async function createJobCheckout(input: {
  accountId: string
  transactionId: string
  jobId: string
  amountCents: number
  applicationFeeCents: number
  currency: string
  description: string
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
}): Promise<{ id: string; url: string }> {
  if (input.applicationFeeCents >= input.amountCents) throw new Error('fee must be less than the amount')
  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountCents,
            product_data: { name: input.description },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: input.applicationFeeCents,
        metadata: { transactionId: input.transactionId, jobId: input.jobId },
      },
      metadata: { transactionId: input.transactionId, jobId: input.jobId },
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    // A double click or a retry reuses the same session instead of making a second one.
    { stripeAccount: input.accountId, idempotencyKey: `checkout-${input.transactionId}-${input.amountCents}` }
  )
  if (!session.url) throw new Error('Stripe returned no checkout URL')
  return { id: session.id, url: session.url }
}

/** Stripe's processing fee on a paid intent, from its balance transaction. */
export async function processingFeeFor(accountId: string, paymentIntentId: string): Promise<number | null> {
  const stripe = getStripeClient()
  const intent = await stripe.paymentIntents.retrieve(
    paymentIntentId,
    { expand: ['latest_charge.balance_transaction'] },
    { stripeAccount: accountId }
  )
  const charge = intent.latest_charge as Stripe.Charge | null
  const balance = charge?.balance_transaction as Stripe.BalanceTransaction | null
  if (!balance || typeof balance === 'string') return null
  return balance.fee_details.filter((d) => d.type === 'stripe_fee').reduce((sum, d) => sum + d.amount, 0)
}

/**
 * Refunds a job payment on the business's account. Doorlink's fee is
 * refunded with it in proportion, so the customer gets their money back
 * and nobody keeps a fee on work that didn't happen.
 */
export async function refundJobPayment(input: {
  accountId: string
  paymentIntentId: string
  amountCents?: number
  idempotencyKey: string
}): Promise<string> {
  const stripe = getStripeClient()
  const refund = await stripe.refunds.create(
    { payment_intent: input.paymentIntentId, amount: input.amountCents, refund_application_fee: true },
    { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey }
  )
  return refund.id
}

export function verifyConnectWebhook(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) throw new PaymentsNotConfiguredError('verify a Connect webhook')
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret)
}
