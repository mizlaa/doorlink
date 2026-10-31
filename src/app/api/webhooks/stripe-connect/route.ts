import { NextResponse } from 'next/server'
import { connectWebhookConfigured, verifyConnectWebhook } from '@/lib/payments/connect'
import { handleConnectEvent } from '@/lib/payments/connect-events'

/**
 * Stripe Connect webhook: events from businesses' own Stripe accounts
 * (job payments, refunds, disputes, onboarding). Signed with its own
 * secret, STRIPE_CONNECT_WEBHOOK_SECRET; unsigned or unverifiable bodies
 * change nothing.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!connectWebhookConfigured()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 })
  }
  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'missing_signature' }, { status: 400 })

  const rawBody = await request.text()
  let event
  try {
    event = verifyConnectWebhook(rawBody, signature)
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    const result = await handleConnectEvent(event)
    return NextResponse.json({ received: true, result })
  } catch (error) {
    console.error('Failed to apply Connect webhook', event.id, error)
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 })
  }
}
