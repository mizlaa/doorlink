'use server'

import { revalidatePath } from 'next/cache'
import { NotificationType } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac'
import { decodeBusinessKey } from '@/lib/pricing/business'
import { notifyBusiness } from '@/lib/pricing/notify'

const schema = z.object({
  businessKey: z.string().trim().min(3),
  status: z.enum(['APPROVED', 'SUSPENDED', 'PENDING']),
  note: z.string().trim().max(500),
})

/**
 * Approves, suspends or returns a business to review. Super admin only,
 * logged, and the business is told. A suspended business disappears from
 * comparisons and cannot take new bookings; its existing jobs carry on.
 */
export async function setBusinessStatusAction(formData: FormData): Promise<void> {
  const session = requirePermission(await getSession(), 'admin:settings')
  const parsed = schema.safeParse({
    businessKey: formData.get('businessKey'),
    status: formData.get('status'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return
  const key = decodeBusinessKey(parsed.data.businessKey)
  if (!key) return
  const { status, note } = parsed.data

  const before = await prisma.businessProfile.findUnique({ where: { businessKey: parsed.data.businessKey } })
  if (!before || before.status === status) return

  await prisma.$transaction([
    prisma.businessProfile.update({
      where: { id: before.id },
      data: { status, statusNote: note || null, statusChangedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: `business.status.${status.toLowerCase()}`,
        entityType: 'BusinessProfile',
        entityId: before.businessKey,
        metadata: { from: before.status, to: status, note },
      },
    }),
  ])

  await notifyBusiness(key, {
    type: NotificationType.VERIFICATION_STATUS,
    title:
      status === 'APPROVED'
        ? 'Your business is live on Doorlink'
        : status === 'SUSPENDED'
          ? 'Your business has been suspended'
          : 'Your business is back under review',
    body:
      status === 'APPROVED'
        ? 'Customers in your service area can now compare and book your prices.'
        : note || 'Customers can’t see your business for now. Contact Doorlink support for details.',
    href: '/pricing',
  })
  revalidatePath('/admin/businesses')
}
