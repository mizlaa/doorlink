import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * The record of sensitive actions: who did what to which thing, and when.
 * Approving or suspending a business, changing the team, issuing or
 * voiding an invoice, reversing a payment, resetting someone's
 * two-step sign-in. Written alongside the action; never edited.
 */
export async function audit(
  entry: { actorId: string | null; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue },
  tx?: Prisma.TransactionClient
): Promise<void> {
  try {
    await (tx ?? prisma).auditLog.create({
      data: { actorId: entry.actorId, action: entry.action, entityType: entry.entityType, entityId: entry.entityId, metadata: entry.metadata },
    })
  } catch (error) {
    // Inside a transaction the caller decides; outside, a failed audit write
    // is logged loudly but doesn't undo an action that already happened.
    if (tx) throw error
    console.error('AUDIT WRITE FAILED', entry.action, entry.entityType, entry.entityId, error)
  }
}
