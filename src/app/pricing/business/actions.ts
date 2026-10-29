'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { readBusinessDetails } from '@/lib/business-details'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { prisma } from '@/lib/prisma'
import { RbacError } from '@/lib/rbac'
import { isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'
import { businessKeyFor, requirePricingAccess } from '@/lib/pricing/business'

export type BusinessDetailsState = { error?: string }

/**
 * Saves the signed-in business's own details. The business is derived
 * from the session, never from the form, and an organisation's details
 * can only be changed by its owner.
 */
export async function saveBusinessDetailsAction(
  _prev: BusinessDetailsState,
  formData: FormData
): Promise<BusinessDetailsState> {
  let session
  try {
    session = await requirePricingAccess(await getSession())
  } catch (error) {
    if (error instanceof RbacError)
      return { error: 'Only installer and supplier accounts have business details.' }
    if (isTradeSubscriptionRequiredError(error)) return { error: error.message }
    throw error
  }

  const result = readBusinessDetails(formData)
  if (!result.ok) return { error: result.error }
  const d = result.data
  const key = businessKeyFor(session)

  try {
    if (key.kind === 'organization') {
      const owner = await prisma.organizationMember.findFirst({
        where: { organizationId: key.id, userId: session.userId, role: 'OWNER' },
      })
      if (!owner) return { error: 'Only the owner of the business can change its details.' }
      await prisma.organization.update({
        where: { id: key.id },
        data: {
          name: d.businessName,
          phone: d.phone,
          email: d.email,
          abn: d.abn,
          suburb: d.suburb,
          state: d.state,
          postcode: d.postcode,
        },
      })
    } else {
      const data = {
        businessName: d.businessName,
        businessPhone: d.phone,
        businessEmail: d.email,
        abn: d.abn,
        baseSuburb: d.suburb,
        baseState: d.state,
        basePostcode: d.postcode,
      }
      await prisma.technicianProfile.upsert({
        where: { userId: key.id },
        update: data,
        create: { userId: key.id, ...data },
      })
    }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath('/pricing')
  redirect('/pricing?details=saved')
}
