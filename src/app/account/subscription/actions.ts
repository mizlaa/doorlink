'use server'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import {
  isPaymentsNotConfigured,
  requirePaymentProvider,
  subscriptionCheckoutAvailable,
} from '@/lib/payments'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function openBillingPortal(): Promise<void> {
  if (!subscriptionCheckoutAvailable()) {
    throw new Error('Subscription management is not connected yet.')
  }

  const session = await getSession()
  if (!session) redirect('/sign-in?next=/account/subscription')

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.userId, providerCustomerId: { not: null } },
      orderBy: { createdAt: 'desc' },
    })
    if (!subscription?.providerCustomerId) {
      throw new Error('There is no Stripe customer on this account yet.')
    }

    const provider = requirePaymentProvider('manage a subscription')
    const result = await provider.createBillingPortalSession({
      providerCustomerId: subscription.providerCustomerId,
      returnUrl: `${siteUrl}/account/subscription`,
    })

    redirect(result.url)
  } catch (error) {
    if (isPaymentsNotConfigured(error)) {
      throw new Error('Subscription management is not connected yet.')
    }
    if (isDatabaseUnreachable(error)) {
      throw new Error("Can't reach the database right now. Try again in a moment.")
    }
    throw error
  }
}
