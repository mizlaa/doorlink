import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { jobActorFor } from '@/lib/marketplace'
import { mediaSource } from '@/lib/media'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/**
 * Serves an image only to someone allowed to see it:
 *  - logos and portfolio photos: anyone (they are a business's public face)
 *  - review photos: anyone while the review is published; otherwise its
 *    author, the reviewed business or an admin
 *  - job photos: the customer, the business and admins
 *  - AI design images: the customer who made them and admins
 * Anything else is a 404, the same as a missing file.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const parts = (await params).key
  const key = parts.join('/')
  const prefix = parts[0]
  const session = await getSession()
  const admin = !!session && can(session.role, 'job:write:any')

  let allowed = false
  if (prefix === 'logos' || prefix === 'portfolio') {
    allowed = true
  } else if (prefix === 'reviews') {
    const review = await prisma.workerReview.findFirst({
      where: { photoKeys: { has: key } },
      select: { status: true, authorId: true, workerId: true },
    })
    allowed =
      !!review &&
      (review.status === 'PUBLISHED' ||
        admin ||
        review.authorId === session?.userId ||
        review.workerId === session?.userId)
  } else if (prefix === 'jobs') {
    const update = await prisma.jobUpdate.findFirst({
      where: { photoKeys: { has: key } },
      select: { job: { select: { customerId: true, workerId: true } } },
    })
    allowed = !!update && !!session && !!jobActorFor(update.job, session.userId, admin)
  } else if (prefix === 'ai') {
    // Visible to anyone with their own generation record for it (a cache hit gets one too).
    allowed =
      !!session &&
      (await prisma.aiGeneration.count({
        where: admin ? { imageKey: key } : { imageKey: key, userId: session.userId },
      })) > 0
  }
  if (!allowed) return new NextResponse('Not found', { status: 404 })

  let source
  try {
    source = await mediaSource(key)
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
  if (!source) return new NextResponse('Not found', { status: 404 })
  if ('redirect' in source) return NextResponse.redirect(source.redirect, 307)
  return new NextResponse(Buffer.from(source.bytes), {
    headers: {
      'Content-Type': source.type,
      'Cache-Control': prefix === 'logos' || prefix === 'portfolio' ? 'public, max-age=3600' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
