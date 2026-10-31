'use server'

import { revalidatePath } from 'next/cache'
import { NotificationType, Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { makeReference } from '@/lib/reference'
import { requirePermission } from '@/lib/rbac'
import { businessCard, decodeBusinessKey } from '@/lib/pricing/business'
import { businessIsEligible } from '@/lib/business/profile'
import { notifyBusiness } from '@/lib/pricing/notify'
import { productLabel } from '@/lib/pricing/products'
import type { UnavailableBusiness } from '@/lib/pricing/compare'

export type CustomQuoteState = { error?: string; ok?: boolean }

/**
 * Asks a business with no automatic price for this design to quote it
 * by hand. Only a business that was eligible in this comparison can be
 * asked, and only once.
 */
export async function requestCustomQuoteAction(_prev: CustomQuoteState, formData: FormData): Promise<CustomQuoteState> {
  const session = requirePermission(await getSession(), 'quote:request')
  const reference = String(formData.get('comparison') ?? '')
  const businessKey = String(formData.get('business') ?? '')
  const message = String(formData.get('message') ?? '').trim().slice(0, 1000)

  const comparison = await prisma.quoteComparison.findFirst({
    where: { reference, customerId: session.userId },
    include: { quotes: { select: { businessOrganizationId: true, businessUserId: true } } },
  })
  if (!comparison) return { error: 'Comparison not found.' }
  const unavailable = (comparison.unavailable as unknown as UnavailableBusiness[] | null) ?? []
  if (!unavailable.some((u) => u.businessKey === businessKey)) return { error: 'That business isn’t part of this comparison.' }
  const key = decodeBusinessKey(businessKey)
  if (!key) return { error: 'That business isn’t part of this comparison.' }
  const already = comparison.quotes.some((q) =>
    key.kind === 'organization' ? q.businessOrganizationId === key.id : q.businessUserId === key.id
  )
  if (already) return { ok: true }
  if (!(await businessIsEligible(key))) return { error: 'This business isn’t taking requests right now.' }
  const card = await businessCard(key)
  if (!card) return { error: 'That business was not found.' }

  await prisma.automatedQuote.create({
    data: {
      reference: makeReference('QTE', 8),
      customerId: session.userId,
      ...(key.kind === 'organization' ? { businessOrganizationId: key.id } : { businessUserId: key.id }),
      businessName: card.name,
      comparisonId: comparison.id,
      product: comparison.product,
      productStyle: null,
      spec: comparison.spec as Prisma.InputJsonValue,
      widthMm: comparison.widthMm,
      heightMm: comparison.heightMm,
      requestedBrand: comparison.requestedBrand,
      motorRequired: comparison.motorRequired,
      requestedMotor: comparison.requestedMotor,
      installRequired: comparison.installRequired,
      postcode: comparison.postcode,
      accessories: comparison.accessories,
      customMessage: message || null,
      status: 'CUSTOM_REQUESTED',
    },
  })
  await notifyBusiness(key, {
    type: NotificationType.LEAD_MATCHED,
    title: `Custom quote request: ${productLabel(comparison.product)} ${comparison.widthMm} × ${comparison.heightMm} mm`,
    body: `${session.name.split(' ')[0]} in ${comparison.postcode} asked you to quote a design your prices don’t cover.`,
    href: '/pricing/quotes',
  })
  revalidatePath(`/compare/${reference}`)
  return { ok: true }
}
