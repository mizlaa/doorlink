'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { canManageBusiness, ensureBusinessProfile } from '@/lib/business/profile'
import { prisma } from '@/lib/prisma'
import { businessKeyFor, encodeBusinessKey, loadBusinessDetails, pricingSession } from '@/lib/pricing/business'
import {
  connectConfigured,
  createConnectedAccount,
  onboardingLink,
  retrieveAccountState,
} from '@/lib/payments/connect'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Sends the business owner to Stripe to set up (or finish setting up)
 * their payment account. Stripe verifies the business and its bank
 * account; Doorlink only records what Stripe reports back.
 */
export async function connectStripeAction(): Promise<void> {
  const session = await pricingSession(await getSession())
  if (!session) redirect('/pricing')
  const key = businessKeyFor(session)
  if (!(await canManageBusiness(session, key))) redirect('/pricing/payments?error=owner')
  if (!connectConfigured()) redirect('/pricing/payments?error=not-configured')

  const profile = await ensureBusinessProfile(key)
  let accountId = profile.stripeAccountId
  let url: string
  try {
    if (!accountId) {
      const details = await loadBusinessDetails(key)
      accountId = await createConnectedAccount({
        businessKey: encodeBusinessKey(key),
        email: details?.email || null,
        businessName: details?.businessName || 'Doorlink business',
      })
      await prisma.businessProfile.update({ where: { id: profile.id }, data: { stripeAccountId: accountId } })
      await prisma.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'business.stripe.connect',
          entityType: 'BusinessProfile',
          entityId: profile.businessKey,
          metadata: { accountId },
        },
      })
    }
    url = await onboardingLink(accountId, `${SITE_URL}/pricing/payments?return=1`, `${SITE_URL}/pricing/payments?refresh=1`)
  } catch (error) {
    console.error('Stripe onboarding failed', error)
    redirect('/pricing/payments?error=stripe')
  }
  redirect(url)
}

/** Re-reads the account from Stripe (the webhook does this too; this is for impatient humans). */
export async function refreshStripeAction(): Promise<void> {
  const session = await pricingSession(await getSession())
  if (!session) return
  const profile = await ensureBusinessProfile(businessKeyFor(session))
  if (!profile.stripeAccountId || !connectConfigured()) return
  try {
    const state = await retrieveAccountState(profile.stripeAccountId)
    await prisma.businessProfile.update({
      where: { id: profile.id },
      data: {
        stripeChargesEnabled: state.chargesEnabled,
        stripePayoutsEnabled: state.payoutsEnabled,
        stripeDetailsSubmitted: state.detailsSubmitted,
        stripeUpdatedAt: new Date(),
      },
    })
  } catch (error) {
    console.error('Stripe refresh failed', error)
  }
  revalidatePath('/pricing/payments')
}
