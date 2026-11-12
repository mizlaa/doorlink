import 'server-only'

import type { NotificationType, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import { isConnected } from './integrations'

/**
 * In-app notifications.
 *
 * Delivery is a row in the database and nothing else. Email and push are
 * both in the brief and neither is connected, so this module does not
 * pretend to send them: `deliveryChannels()` reports exactly which
 * channels a notification actually reached, and the notifications page
 * says so rather than implying an email went out.
 */

export interface NotifyInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  href?: string
}

/**
 * Writing a notification must never be the reason an action fails. If a
 * customer hires a technician and the notification write dies, the hire
 * still happened — so this swallows database-unreachable rather than
 * unwinding the caller's work, and rethrows anything it does not
 * recognise.
 */
export async function notify(input: NotifyInput, tx?: Prisma.TransactionClient): Promise<void> {
  const client = tx ?? prisma
  try {
    await client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
      },
    })
  } catch (error) {
    if (tx) throw error // inside a transaction the caller decides
    if (isDatabaseUnreachable(error)) return
    throw error
  }
}

export async function notifyMany(inputs: NotifyInput[], tx?: Prisma.TransactionClient): Promise<void> {
  for (const input of inputs) await notify(input, tx)
}

/** Which channels a notification written right now would actually reach. */
export function deliveryChannels(): { inApp: true; email: boolean; push: boolean } {
  return {
    inApp: true,
    email: isConnected('email'),
    // VAPID keys alone send nothing: there is no push sender or service-worker
    // handler yet, so push is reported as off until one is built.
    push: false,
  }
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  try {
    return await prisma.notification.count({ where: { userId, readAt: null } })
  } catch (error) {
    // The header renders on every page. A count that cannot be fetched
    // shows no badge; it does not take the header down.
    if (isDatabaseUnreachable(error)) return 0
    throw error
  }
}
