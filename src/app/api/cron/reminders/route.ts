import { NextResponse } from 'next/server'
import { sendAppointmentReminders } from '@/lib/appointments/reminders'
import { sweepRateLimits } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Hourly: day-before appointment reminders, and clearing old rate-limit
 * windows. Requires `Authorization: Bearer $CRON_SECRET`. Running it twice
 * never sends a reminder twice.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  const reminders = await sendAppointmentReminders()
  const swept = await sweepRateLimits()
  return NextResponse.json({ reminders, rateLimitWindowsCleared: swept })
}
