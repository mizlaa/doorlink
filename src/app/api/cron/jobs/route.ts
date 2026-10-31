import { NextResponse } from 'next/server'
import { completeOverdueJobs } from '@/lib/jobs/auto-complete'

export const dynamic = 'force-dynamic'

/**
 * Scheduled housekeeping (e.g. a daily Vercel cron): completes finished
 * jobs whose customer didn't respond in time. Requires
 * `Authorization: Bearer $CRON_SECRET`. Job pages also do this lazily, so
 * nothing is stuck if the schedule isn't set up.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  const completed = await completeOverdueJobs()
  return NextResponse.json({ completed })
}
