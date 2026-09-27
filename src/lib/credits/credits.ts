import 'server-only'

import { CreditLedgerKind, type Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import {
  IN_FLIGHT_STALE_MS,
  PREVIEW_CREDIT_COST,
  WELCOME_CREDITS,
} from './constants'
import { isUniqueViolation } from './errors'

export type PreviewSpendResult =
  | { ok: true; generationId: string }
  | { ok: false; reason: 'no_credits' | 'in_flight' }

async function refundGenerationIfNeeded(
  tx: Prisma.TransactionClient,
  userId: string,
  generationId: string,
  amount: number = PREVIEW_CREDIT_COST
): Promise<void> {
  try {
    await tx.creditLedger.create({
      data: {
        userId,
        delta: amount,
        kind: CreditLedgerKind.REFUND,
        generationId,
      },
    })
    await tx.creditBalance.update({
      where: { userId },
      data: { balance: { increment: amount } },
    })
  } catch (error) {
    if (isUniqueViolation(error)) return
    throw error
  }
}

async function clearStaleInFlight(
  tx: Prisma.TransactionClient,
  userId: string,
  generationId: string | null,
  startedAt: Date | null
): Promise<void> {
  if (!generationId || !startedAt) return
  const staleBefore = new Date(Date.now() - IN_FLIGHT_STALE_MS)
  if (startedAt >= staleBefore) return

  await refundGenerationIfNeeded(tx, userId, generationId)
  await tx.creditBalance.update({
    where: { userId },
    data: { inFlightGenerationId: null, inFlightStartedAt: null },
  })
}

export async function ensureWelcomeCredits(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    })

    const granted = await tx.creditBalance.updateMany({
      where: { userId, welcomeGranted: false },
      data: {
        welcomeGranted: true,
        balance: { increment: WELCOME_CREDITS },
      },
    })
    if (granted.count === 0) return

    await tx.creditLedger.create({
      data: {
        userId,
        delta: WELCOME_CREDITS,
        kind: CreditLedgerKind.WELCOME,
      },
    })
  })
}

export async function getCreditBalance(userId: string): Promise<number> {
  const row = await prisma.creditBalance.findUnique({ where: { userId } })
  return row?.balance ?? 0
}

export async function listCreditPacksForPurchase() {
  return prisma.creditPack.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function beginPreviewSpend(userId: string): Promise<PreviewSpendResult> {
  const generationId = crypto.randomUUID()

  return prisma.$transaction(async (tx) => {
    const row = await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    })

    await clearStaleInFlight(tx, userId, row.inFlightGenerationId, row.inFlightStartedAt)

    const current = await tx.creditBalance.findUniqueOrThrow({ where: { userId } })
    if (current.inFlightGenerationId) {
      return { ok: false, reason: 'in_flight' }
    }

    const spent = await tx.creditBalance.updateMany({
      where: {
        userId,
        balance: { gte: PREVIEW_CREDIT_COST },
        inFlightGenerationId: null,
      },
      data: {
        balance: { decrement: PREVIEW_CREDIT_COST },
        inFlightGenerationId: generationId,
        inFlightStartedAt: new Date(),
      },
    })

    if (spent.count === 0) {
      return { ok: false, reason: 'no_credits' }
    }

    await tx.creditLedger.create({
      data: {
        userId,
        delta: -PREVIEW_CREDIT_COST,
        kind: CreditLedgerKind.SPEND,
        generationId,
      },
    })

    return { ok: true, generationId }
  })
}

export async function clearPreviewInFlight(userId: string, generationId: string): Promise<void> {
  await prisma.creditBalance.updateMany({
    where: { userId, inFlightGenerationId: generationId },
    data: { inFlightGenerationId: null, inFlightStartedAt: null },
  })
}

export async function refundPreviewCredit(userId: string, generationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await refundGenerationIfNeeded(tx, userId, generationId)
    await tx.creditBalance.updateMany({
      where: { userId, inFlightGenerationId: generationId },
      data: { inFlightGenerationId: null, inFlightStartedAt: null },
    })
  })
}
