import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTwilioSignature } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Twilio's message status callback, signed with TWILIO_AUTH_TOKEN. This is
 * the only thing that marks a reminder text as delivered (or failed). A
 * repeat of the same status changes nothing.
 */
export async function POST(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) return NextResponse.json({ error: 'sms_not_configured' }, { status: 503 })
  const params = Object.fromEntries(new URLSearchParams(await request.text()))
  const url = `${SITE_URL}/api/webhooks/twilio`
  if (!verifyTwilioSignature(url, params, request.headers.get('x-twilio-signature'), token)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }
  const sid = params.MessageSid
  const status = params.MessageStatus
  if (!sid || !status) return NextResponse.json({ received: true, result: 'ignored' })
  const final = status === 'delivered' ? 'REMINDER_SMS_DELIVERED' : status === 'undelivered' || status === 'failed' ? 'REMINDER_SMS_FAILED' : null
  if (!final) return NextResponse.json({ received: true, result: 'in_progress' })
  const sent = await prisma.appointmentEvent.findFirst({ where: { type: 'REMINDER_SMS_SENT', note: { startsWith: `sms:${sid}` } }, select: { appointmentId: true } })
  if (!sent) return NextResponse.json({ received: true, result: 'unknown_message' })
  const already = await prisma.appointmentEvent.count({ where: { appointmentId: sent.appointmentId, type: final, note: { startsWith: `sms:${sid}` } } })
  if (already === 0) {
    await prisma.appointmentEvent.create({ data: { appointmentId: sent.appointmentId, type: final, actorId: null, note: `sms:${sid}${params.ErrorCode ? ` error ${params.ErrorCode}` : ''}` } })
  }
  return NextResponse.json({ received: true, result: already ? 'duplicate' : 'applied' })
}
