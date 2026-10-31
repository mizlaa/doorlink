'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/rbac'

export type ReportState = { error?: string; ok?: boolean }

const REASONS = ['fake', 'abusive', 'private-information', 'not-a-customer', 'other'] as const

/**
 * Flags a review for a Doorlink admin to look at. Reporting never hides a
 * review by itself: a business can't make a fair negative review vanish
 * by reporting it. One open report per person per review.
 */
export async function reportReviewAction(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const session = requireSession(await getSession())
  const reviewId = String(formData.get('reviewId') ?? '')
  const reason = String(formData.get('reason') ?? '')
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 1000)
  if (!(REASONS as readonly string[]).includes(reason)) return { error: 'Choose a reason.' }
  const review = await prisma.workerReview.findUnique({ where: { id: reviewId }, select: { id: true } })
  if (!review) return { error: 'Review not found.' }
  const existing = await prisma.report.findFirst({
    where: { reporterId: session.userId, targetType: 'WORKER_REVIEW', targetId: reviewId, status: 'OPEN' },
  })
  if (existing) return { ok: true }
  await prisma.report.create({
    data: { reporterId: session.userId, targetType: 'WORKER_REVIEW', targetId: reviewId, reason, detail: detail || null },
  })
  return { ok: true }
}
