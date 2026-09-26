import { NextResponse } from 'next/server'
import { PayoutStatus } from '@prisma/client'
import type Stripe from 'stripe'
import { paymentProvider, isPaymentsNotConfigured } from '@/lib/payments'
import {
  applyPaymentFailed,
  applyPaymentSucceeded,
  applyPayoutStatus,
  applyRefund,
} from '@/lib/payments/ledger'
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionLifecycle,
} from '@/lib/payments/subscription-sync'

/**
 * The payment provider's webhook endpoint.
 *
 * This is the only route in the application that can mark money as having
 * moved, and it will not do so for anything it cannot prove came from the
 * provider. The body is read as raw text (not JSON) because signature
 * verification must run over the exact bytes that were signed — parsing
 * first and verifying after is how signature checks get quietly defeated.
 *
 * With no provider configured it answers 503 and changes nothing. It does
 * not accept an unsigned payload "for testing": a test path into the code
 * that marks transactions PAID is a production path waiting to be found.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const provider = paymentProvider()
  if (!provider) {
    return NextResponse.json(
      {
        error: 'payments_not_configured',
        message:
          'No payment provider is connected. Nothing was recorded. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable this endpoint.',
      },
      { status: 503 }
    )
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  const rawBody = await request.text()

  let event
  try {
    event = await provider.verifyWebhook(rawBody, signature)
  } catch (error) {
    if (isPaymentsNotConfigured(error)) {
      return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 })
    }
    // A body that fails verification is not logged in full — it is
    // attacker-controlled, and it may contain whatever they want in our
    // logs.
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    await handleVerifiedEvent(event.type, event.payload)
  } catch (error) {
    // Returning 500 tells the provider to retry, which is what we want:
    // the ledger writes are idempotent, so a retry is safe and losing the
    // event is not.
    console.error('Failed to apply webhook', event.id, error)
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/**
 * Maps a verified provider event onto a ledger write.
 *
 * The shapes below are Stripe's. They are read defensively rather than
 * cast, because this is the boundary where outside data enters the part
 * of the system that decides who has been paid.
 */
async function handleVerifiedEvent(type: string, payload: unknown): Promise<void> {
  const data = (payload as { data?: { object?: Record<string, unknown> } })?.data?.object ?? {}

  switch (type) {
    case 'payment_intent.succeeded': {
      const id = asString(data.id)
      if (!id) return
      await applyPaymentSucceeded(id, new Date())
      return
    }

    case 'payment_intent.payment_failed': {
      const id = asString(data.id)
      if (!id) return
      const failure = data.last_payment_error as { message?: string } | undefined
      await applyPaymentFailed(id, failure?.message ?? 'The payment was declined.')
      return
    }

    case 'charge.refunded': {
      const intentId = asString(data.payment_intent)
      const refunded = asNumber(data.amount_refunded)
      if (!intentId || refunded === null) return
      await applyRefund(intentId, refunded, 'Refunded by the provider.')
      return
    }

    case 'transfer.paid':
    case 'payout.paid': {
      const id = asString(data.id)
      if (!id) return
      await applyPayoutStatus(id, PayoutStatus.PAID, new Date())
      return
    }

    case 'transfer.failed':
    case 'payout.failed': {
      const id = asString(data.id)
      if (!id) return
      await applyPayoutStatus(id, PayoutStatus.FAILED, null)
      return
    }

    case 'checkout.session.completed': {
      await handleCheckoutSessionCompleted(data as unknown as Stripe.Checkout.Session)
      return
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await handleSubscriptionLifecycle(data as unknown as Stripe.Subscription)
      return
    }

    default:
      // Unrecognised events are acknowledged, not errored: the provider
      // sends many we do not care about, and answering 500 to those
      // would have it retry them forever.
      return
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
