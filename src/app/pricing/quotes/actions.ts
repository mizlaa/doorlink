'use server'

import { revalidatePath } from 'next/cache'
import { NotificationType, type Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { businessKeyFor, pricingSession, quoteBusinessWhere } from '@/lib/pricing/business'
import { totalsForLines, type QuoteLine } from '@/lib/pricing/engine'
import { parseMoney } from '@/lib/pricing/validation'
import { notifyCustomer } from '@/lib/pricing/notify'
import { formatMoney } from '@/lib/money'
import { productLabel } from '@/lib/pricing/products'

export type CustomReplyState = { error?: string; ok?: boolean }

/**
 * A business answers a custom quote request: a price (fixed, or an
 * estimate confirmed on inspection) or a polite no. Only the business the
 * request was sent to can answer it, and only once.
 */
export async function replyCustomQuoteAction(_prev: CustomReplyState, formData: FormData): Promise<CustomReplyState> {
  const session = await pricingSession(await getSession())
  if (!session) return { error: 'Sign in with your business account.' }
  const quote = await prisma.automatedQuote.findFirst({
    where: {
      id: String(formData.get('quoteId') ?? ''),
      status: 'CUSTOM_REQUESTED',
      ...quoteBusinessWhere(businessKeyFor(session)),
    },
  })
  if (!quote) return { error: 'This request has already been answered.' }

  if (formData.get('decision') === 'decline') {
    const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
    await prisma.automatedQuote.update({
      where: { id: quote.id },
      data: { status: 'DECLINED', declinedReason: reason || null, respondedAt: new Date() },
    })
    await notifyCustomer(quote.customerId, {
      type: NotificationType.QUOTE_DECLINED,
      title: `${quote.businessName} can’t quote this one`,
      body: reason || 'They aren’t able to quote this design. Your other quotes are still available.',
      href: '/quotes',
    })
    revalidatePath('/pricing/quotes')
    return { ok: true }
  }

  const priceCents = parseMoney(String(formData.get('price') ?? ''))
  if (priceCents === null || priceCents <= 0 || priceCents > 100_000_000) return { error: 'Enter the price in dollars.' }
  const gst = formData.get('gst') === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'INCLUSIVE'
  const priceType = formData.get('priceType') === 'ESTIMATE' ? 'ESTIMATE' : 'FIXED'
  const installation = formData.get('installation') === 'NOT_INCLUDED' ? 'NOT_INCLUDED' : 'INCLUDED'
  const note = String(formData.get('note') ?? '').trim().slice(0, 500)
  const lines: QuoteLine[] = [{ kind: 'base', label: 'Quoted price', amountCents: priceCents, gst }]
  const totals = totalsForLines(lines)

  await prisma.$transaction([
    prisma.automatedQuoteOption.create({
      data: {
        quoteId: quote.id,
        productBrand: null,
        motorIncluded: quote.motorRequired,
        motorBrand: quote.requestedMotor,
        installation,
        gst,
        priceCents,
        installPriceCents: null,
        ...totals,
        note: note || null,
        priceType,
        lines: lines as unknown as Prisma.InputJsonValue,
        unpricedAccessories: [],
      },
    }),
    prisma.automatedQuote.update({ where: { id: quote.id }, data: { status: 'ISSUED', respondedAt: new Date() } }),
  ])
  await notifyCustomer(quote.customerId, {
    type: NotificationType.QUOTE_RECEIVED,
    title: `${quote.businessName} quoted your ${productLabel(quote.product).toLowerCase()}`,
    body: `${formatMoney(totals.totalIncGstCents)} inc GST${priceType === 'ESTIMATE' ? ', an estimate confirmed on inspection' : ''}.`,
    href: `/quotes/${quote.reference}`,
  })
  revalidatePath('/pricing/quotes')
  return { ok: true }
}
