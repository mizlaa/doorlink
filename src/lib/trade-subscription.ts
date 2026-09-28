import 'server-only'

import { Role } from '@prisma/client'
import type { Session } from './auth'
import { isDatabaseUnreachable } from './db-errors'
import { ACTIVE_SUBSCRIPTION_STATUSES } from './entitlements'
import { prisma } from './prisma'

export const TRADE_ROLES: Role[] = [Role.TECHNICIAN, Role.SUPPLIER, Role.MANUFACTURER]

export function roleRequiresTradeSubscription(role: Role): boolean {
  return TRADE_ROLES.includes(role)
}

export type TradeSubscriptionAccess =
  | { allowed: true }
  | { allowed: false; reason: 'subscription_required' }
  | { allowed: true; failOpen: true }

/**
 * Whether a signed-in user may use trade tools. Customers and admins never
 * need a subscription. Unreachable database: allow (fail open). Confirmed
 * no active row for a trade role: block.
 */
export async function tradeSubscriptionAccess(session: Session): Promise<TradeSubscriptionAccess> {
  if (!roleRequiresTradeSubscription(session.role)) {
    return { allowed: true }
  }

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.userId, status: { in: ACTIVE_SUBSCRIPTION_STATUSES } },
      orderBy: { createdAt: 'desc' },
    })
    if (subscription) return { allowed: true }
    return { allowed: false, reason: 'subscription_required' }
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      return { allowed: true, failOpen: true }
    }
    throw error
  }
}

export async function requireTradeSubscription(session: Session): Promise<void> {
  const access = await tradeSubscriptionAccess(session)
  if (!access.allowed) {
    throw new TradeSubscriptionRequiredError()
  }
}

export class TradeSubscriptionRequiredError extends Error {
  constructor() {
    super('An active Doorlink trade subscription is required.')
    this.name = 'TradeSubscriptionRequiredError'
  }
}

export function isTradeSubscriptionRequiredError(error: unknown): error is TradeSubscriptionRequiredError {
  return error instanceof TradeSubscriptionRequiredError
}
