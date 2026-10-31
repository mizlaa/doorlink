import 'server-only'

import { Prisma, type BusinessProfile } from '@prisma/client'
import type { Session } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  businessIsSubscribed,
  businessKeyFor,
  decodeBusinessKey,
  encodeBusinessKey,
  type BusinessKey,
} from '@/lib/pricing/business'

/**
 * A business's marketplace profile: approval, public profile, coverage,
 * accessories and payment account. One row per business key, created the
 * first time the business opens its settings, and PENDING until a Doorlink
 * admin approves it. Only an approved, subscribed business is quoted to
 * customers or takes bookings.
 */

export const PROFILE_INCLUDE = {
  serviceAreas: { orderBy: { fromPostcode: 'asc' } },
  accessories: true,
  portfolio: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.BusinessProfileInclude

export type FullBusinessProfile = Prisma.BusinessProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>

function ownerColumns(key: BusinessKey) {
  return key.kind === 'organization' ? { organizationId: key.id } : { userId: key.id }
}

export async function ensureBusinessProfile(key: BusinessKey): Promise<FullBusinessProfile> {
  const businessKey = encodeBusinessKey(key)
  try {
    return await prisma.businessProfile.upsert({
      where: { businessKey },
      update: {},
      create: { businessKey, ...ownerColumns(key) },
      include: PROFILE_INCLUDE,
    })
  } catch (error) {
    // A layout and its page render at the same time; on a business's first
    // visit both try to create the row, and the loser reads the winner's.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.businessProfile.findUniqueOrThrow({ where: { businessKey }, include: PROFILE_INCLUDE })
    }
    throw error
  }
}

export async function loadBusinessProfile(key: BusinessKey | string): Promise<FullBusinessProfile | null> {
  const businessKey = typeof key === 'string' ? key : encodeBusinessKey(key)
  return prisma.businessProfile.findUnique({ where: { businessKey }, include: PROFILE_INCLUDE })
}

/** Approved by Doorlink and paying for a trade subscription. */
export async function businessIsEligible(key: BusinessKey, profile?: Pick<BusinessProfile, 'status'> | null) {
  const row =
    profile ??
    (await prisma.businessProfile.findUnique({
      where: { businessKey: encodeBusinessKey(key) },
      select: { status: true },
    }))
  if (row?.status !== 'APPROVED') return false
  return businessIsSubscribed(key)
}

/**
 * Whether this person may change the business's profile, payments and
 * prices: the account itself, or the owner of the organisation. Staff of
 * an organisation can see its work but not its money or public face.
 */
export async function canManageBusiness(session: Session, key: BusinessKey = businessKeyFor(session)) {
  if (key.kind === 'user') return key.id === session.userId && !session.organizationId
  if (session.organizationId !== key.id) return false
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId: key.id, userId: session.userId },
    select: { role: true },
  })
  return membership?.role === 'OWNER'
}

export function profileKey(profile: Pick<BusinessProfile, 'businessKey'>): BusinessKey {
  const key = decodeBusinessKey(profile.businessKey)
  if (!key) throw new Error(`bad business key ${profile.businessKey}`)
  return key
}

/** Online payment is possible once Stripe says the account can take charges. */
export function canTakeOnlinePayment(profile: Pick<BusinessProfile, 'stripeAccountId' | 'stripeChargesEnabled'>) {
  return !!profile.stripeAccountId && profile.stripeChargesEnabled
}

/** What is still missing before a business can be approved and appear to customers. */
export function profileChecklist(
  profile: FullBusinessProfile,
  extras: { hasDetails: boolean; hasPrices: boolean; subscribed: boolean }
) {
  return [
    { id: 'details', label: 'Business name, phone and alert email', done: extras.hasDetails },
    { id: 'profile', label: 'A short description and the products you supply', done: !!profile.description && profile.products.length > 0 },
    { id: 'coverage', label: 'The postcodes you service', done: profile.serviceAreas.length > 0 },
    { id: 'prices', label: 'At least one automated price', done: extras.hasPrices },
    { id: 'subscription', label: 'An active trade subscription', done: extras.subscribed },
  ]
}
