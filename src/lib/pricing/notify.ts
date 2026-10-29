import 'server-only'

import { after } from 'next/server'
import type { NotificationType } from '@prisma/client'
import { sendEmail } from '@/lib/email'
import { notifyMany } from '@/lib/notifications'
import { businessAlertEmail, businessUserIds, type BusinessKey } from './business'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Tells a business something happened: an in-app notification for every
 * account in it, and — after the response has gone back to the customer,
 * so they never wait on it — an email to the business's alert address.
 */
export async function notifyBusiness(
  key: BusinessKey,
  message: { type: NotificationType; title: string; body: string; href: string }
): Promise<void> {
  const userIds = await businessUserIds(key)
  await notifyMany(userIds.map((userId) => ({ userId, ...message })))

  after(async () => {
    const to = await businessAlertEmail(key)
    if (to) {
      await sendEmail({
        to,
        subject: message.title,
        text: `${message.body}\n\nOpen in Doorlink: ${new URL(message.href, SITE_URL).toString()}`,
      })
    }
  })
}
