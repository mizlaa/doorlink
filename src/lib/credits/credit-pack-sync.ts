import 'server-only'

import type Stripe from 'stripe'
import { CreditLedgerKind } from '@prisma/client'
import { prisma } from '../prisma'
import { isUniqueViolation } from './errors'
import { creditPackPurchaseValid } from './credit-pack-valid'

export async function handleCreditPackCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== 'payment') return
  if (session.payment_status !== 'paid') return

  const userId = session.metadata?.userId
  const packCode = session.metadata?.packCode
  if (!userId || !packCode) {
    console.warn('credit checkout missing metadata', session.id)
    return
  }

  const pack = await prisma.creditPack.findUnique({ where: { code: packCode } })
  if (!pack) {
    console.warn('credit checkout unknown pack', packCode, session.id)
    return
  }

  const metadataCredits = Number.parseInt(session.metadata?.credits ?? '', 10)
  const metadataPriceCents = Number.parseInt(session.metadata?.priceCents ?? '', 10)

  if (
    !creditPackPurchaseValid({
      packCredits: pack.credits,
      packPriceCents: pack.priceCents,
      packCurrency: pack.currency,
      metadataCredits: Number.isFinite(metadataCredits) ? metadataCredits : null,
      metadataPriceCents: Number.isFinite(metadataPriceCents) ? metadataPriceCents : null,
      amountTotal: session.amount_total,
      currency: session.currency,
    })
  ) {
    console.warn('credit checkout amount mismatch', session.id)
    return
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.creditLedger.create({
        data: {
          userId,
          delta: pack.credits,
          kind: CreditLedgerKind.PURCHASE,
          providerSessionId: session.id,
          packCode: pack.code,
        },
      })
      await tx.creditBalance.upsert({
        where: { userId },
        create: { userId, balance: pack.credits },
        update: { balance: { increment: pack.credits } },
      })
    })
  } catch (error) {
    if (isUniqueViolation(error)) return
    throw error
  }
}
