import { NextResponse } from 'next/server'
import { applyEmailEvent, verifyResendWebhook } from '@/lib/invoices/delivery'

/**
 * Resend's delivery events (delivered, bounced, complained), signed with
 * RESEND_WEBHOOK_SECRET. This is the only thing that marks an invoice
 * email as delivered or bounced; an unsigned or stale request changes
 * nothing.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'email_webhook_not_configured' }, { status: 503 })
  const body = await request.text()
  const ok = verifyResendWebhook(
    { id: request.headers.get('svix-id'), timestamp: request.headers.get('svix-timestamp'), signature: request.headers.get('svix-signature') },
    body,
    secret
  )
  if (!ok) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })

  let event: { type?: string; data?: { email_id?: string; bounce?: { message?: string } } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  try {
    const result = await applyEmailEvent({
      id: request.headers.get('svix-id')!,
      type: String(event.type ?? ''),
      emailId: event.data?.email_id ?? null,
      reason: event.data?.bounce?.message ?? null,
    })
    return NextResponse.json({ received: true, result })
  } catch (error) {
    console.error('Failed to apply Resend webhook', error)
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 })
  }
}
