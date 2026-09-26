'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { activeSubscription } from '@/lib/entitlements'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import {
  isPaymentsNotConfigured,
  requirePaymentProvider,
  subscriptionCheckoutAvailable,
} from '@/lib/payments'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const planIdSchema = z.string().trim().min(1)

export async function startSubscriptionCheckout(formData: FormData): Promise<void> {
  if (!subscriptionCheckoutAvailable()) {
    throw new Error('Subscription checkout is not connected yet.')
  }

  const session = await getSession()
  if (!session) redirect('/sign-in?next=/plans')

  const parsed = planIdSchema.safeParse(formData.get('planId'))
  if (!parsed.success) throw new Error('Choose a plan to subscribe.')

  try {
    const existing = await activeSubscription(session.userId)
    if (existing) redirect('/account/subscription')

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: parsed.data } })
    if (
      !plan ||
      !plan.isActive ||
      plan.priceCents === null ||
      !plan.stripePriceId
    ) {
      throw new Error('This plan cannot be subscribed to yet.')
    }

    const provider = requirePaymentProvider('start a subscription')
    const result = await provider.createSubscriptionCheckout({
      providerPriceId: plan.stripePriceId,
      customerEmail: session.email,
      userId: session.userId,
      planId: plan.id,
      trialDays: plan.trialDays,
      successUrl: `${siteUrl}/account/subscription?checkout=success`,
      cancelUrl: `${siteUrl}/account/subscription?checkout=cancel`,
    })

    redirect(result.url)
  } catch (error) {
    if (isPaymentsNotConfigured(error)) {
      throw new Error('Subscription checkout is not connected yet.')
    }
    if (isDatabaseUnreachable(error)) {
      throw new Error("Can't reach the database right now. Try again in a moment.")
    }
    throw error
  }
}
