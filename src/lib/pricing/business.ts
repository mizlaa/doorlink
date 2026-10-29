import 'server-only'

import type { PricedProduct, PricingRule, Prisma } from '@prisma/client'
import type { Session } from '@/lib/auth'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { RbacError, requirePermission } from '@/lib/rbac'
import { isTradeSubscriptionRequiredError, requireTradeSubscription } from '@/lib/trade-subscription'
import type { RuleTerms } from './engine'

/**
 * Who a business is, and the only doors into its prices.
 *
 * A business is an organisation when the account belongs to one (so its
 * staff share one price list), otherwise the trade account itself — the
 * same rule marketplace listings follow. Every query that touches
 * pricing rules or business quotes goes through `businessWhere`, so a
 * business can only ever read or change its own rows; the check is in
 * the query, not in what the page happens to show.
 */

export type BusinessKey = { kind: 'organization'; id: string } | { kind: 'user'; id: string }

export function businessKeyFor(session: Session): BusinessKey {
  return session.organizationId
    ? { kind: 'organization', id: session.organizationId }
    : { kind: 'user', id: session.userId }
}

/** The ownership filter for pricing rules. */
export function ruleOwnerWhere(key: BusinessKey): Prisma.PricingRuleWhereInput {
  return key.kind === 'organization' ? { organizationId: key.id } : { ownerId: key.id, organizationId: null }
}

/** The ownership columns for a new pricing rule. */
export function ruleOwnerData(key: BusinessKey): { organizationId: string } | { ownerId: string } {
  return key.kind === 'organization' ? { organizationId: key.id } : { ownerId: key.id }
}

/** The filter for quotes issued by a business. */
export function quoteBusinessWhere(key: BusinessKey): Prisma.AutomatedQuoteWhereInput {
  return key.kind === 'organization'
    ? { businessOrganizationId: key.id }
    : { businessUserId: key.id, businessOrganizationId: null }
}

/** URL-safe business id: "o_<org id>" or "u_<user id>". */
export function encodeBusinessKey(key: BusinessKey): string {
  return `${key.kind === 'organization' ? 'o' : 'u'}_${key.id}`
}

export function decodeBusinessKey(value: string): BusinessKey | null {
  // Ids are cuids, or slug-like for seeded organisations (demo-supplier-org).
  const match = /^([ou])_([A-Za-z0-9_-]{1,64})$/.exec(value)
  if (!match) return null
  return { kind: match[1] === 'o' ? 'organization' : 'user', id: match[2] }
}

/**
 * The gate for the pricing area: a technician or supplier account with an
 * active trade subscription. Throws RbacError or
 * TradeSubscriptionRequiredError.
 */
export async function requirePricingAccess(session: Session | null): Promise<Session> {
  const allowed = requirePermission(session, 'pricing:write:own')
  await requireTradeSubscription(allowed)
  return allowed
}

/**
 * The same gate for pages, which render alongside the layout rather than
 * after it: null instead of throwing, and the layout explains why.
 */
export async function pricingSession(session: Session | null): Promise<Session | null> {
  try {
    return await requirePricingAccess(session)
  } catch (error) {
    if (error instanceof RbacError || isTradeSubscriptionRequiredError(error)) return null
    throw error
  }
}

export function toRuleTerms(rule: PricingRule): RuleTerms {
  return {
    id: rule.id,
    product: rule.product,
    productStyle: rule.productStyle,
    productBrand: rule.productBrand,
    motorIncluded: rule.motorIncluded,
    motorBrand: rule.motorBrand,
    installation: rule.installation,
    installPriceCents: rule.installPriceCents,
    minWidthMm: rule.minWidthMm,
    maxWidthMm: rule.maxWidthMm,
    minHeightMm: rule.minHeightMm,
    maxHeightMm: rule.maxHeightMm,
    priceCents: rule.priceCents,
    gst: rule.gst,
    currency: rule.currency,
    note: rule.note,
    active: rule.active,
  }
}

/** The account(s) behind a business: its members, or the one account. */
export async function businessUserIds(key: BusinessKey): Promise<string[]> {
  if (key.kind === 'user') return [key.id]
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: key.id },
    select: { userId: true },
  })
  return members.map((m) => m.userId)
}

/** A business takes part while someone on its account holds an active trade subscription. */
export async function businessIsSubscribed(key: BusinessKey): Promise<boolean> {
  const userIds = await businessUserIds(key)
  if (userIds.length === 0) return false
  const count = await prisma.subscription.count({
    where: { userId: { in: userIds }, status: { in: ACTIVE_SUBSCRIPTION_STATUSES } },
  })
  return count > 0
}

export interface BusinessCard {
  key: string
  name: string
  /** Public technician profile, when the business has one. */
  profileHref: string | null
  /** Only from reviews customers left on completed jobs; null when there are none. */
  ratingAvg: number | null
  ratingCount: number
  jobsCompleted: number
  baseSuburb: string | null
}

export async function businessCard(key: BusinessKey): Promise<BusinessCard | null> {
  const userIds = await businessUserIds(key)
  if (userIds.length === 0) return null

  const [organization, users, reviews] = await Promise.all([
    key.kind === 'organization'
      ? prisma.organization.findUnique({ where: { id: key.id }, select: { name: true } })
      : Promise.resolve(null),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        technicianProfile: { select: { businessName: true, jobsCompleted: true, baseSuburb: true } },
        memberships: { select: { organizationId: true, role: true } },
      },
    }),
    prisma.workerReview.aggregate({
      where: { workerId: { in: userIds } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ])

  if (key.kind === 'organization' && !organization) return null
  if (key.kind === 'user' && users.length === 0) return null

  // The profile to link: the owner's technician profile for an
  // organisation, or the account's own.
  const owner =
    key.kind === 'organization'
      ? (users.find((u) => u.memberships.some((m) => m.organizationId === key.id && m.role === 'OWNER')) ??
        users[0])
      : users[0]
  const profile = owner?.technicianProfile ?? null
  const name =
    key.kind === 'organization'
      ? organization!.name
      : profile?.businessName?.trim() || owner?.name || 'Business'

  return {
    key: encodeBusinessKey(key),
    name,
    profileHref: profile && owner ? `/technicians/${owner.id}` : null,
    ratingAvg: reviews._count._all > 0 ? reviews._avg.rating : null,
    ratingCount: reviews._count._all,
    jobsCompleted: users.reduce((sum, u) => sum + (u.technicianProfile?.jobsCompleted ?? 0), 0),
    baseSuburb: profile?.baseSuburb ?? null,
  }
}

/**
 * Businesses with at least one active automated price for a product and
 * a current subscription. Only who they are is returned — never their
 * rules — so listing them reveals nothing about their pricing.
 */
export async function participatingBusinesses(product: PricedProduct): Promise<BusinessCard[]> {
  const owners = await prisma.pricingRule.findMany({
    where: { product, active: true },
    select: { organizationId: true, ownerId: true },
    distinct: ['organizationId', 'ownerId'],
  })
  const keys: BusinessKey[] = owners.map((o) =>
    o.organizationId ? { kind: 'organization', id: o.organizationId } : { kind: 'user', id: o.ownerId! }
  )
  const cards = await Promise.all(
    keys.map(async (key) => ((await businessIsSubscribed(key)) ? businessCard(key) : null))
  )
  return cards
    .filter((card): card is BusinessCard => card !== null)
    .sort(
      (a, b) =>
        (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || b.ratingCount - a.ratingCount || a.name.localeCompare(b.name)
    )
}

/** Product brands businesses have named for a product, for the customer's preference list. */
export async function offeredBrands(product: PricedProduct): Promise<string[]> {
  const rows = await prisma.pricingRule.findMany({
    where: { product, active: true, productBrand: { not: null } },
    select: { productBrand: true },
    distinct: ['productBrand'],
  })
  const seen = new Map<string, string>()
  for (const row of rows) {
    const brand = row.productBrand!.trim()
    const key = brand.toLowerCase()
    if (brand && !seen.has(key)) seen.set(key, brand)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

export interface BusinessDetails {
  businessName: string
  phone: string
  email: string
  abn: string
  suburb: string
  state: string
  postcode: string
}

/** The editable details of a business, as stored. */
export async function loadBusinessDetails(key: BusinessKey): Promise<BusinessDetails | null> {
  if (key.kind === 'organization') {
    const org = await prisma.organization.findUnique({ where: { id: key.id } })
    if (!org) return null
    return {
      businessName: org.name,
      phone: org.phone ?? '',
      email: org.email ?? '',
      abn: org.abn ?? '',
      suburb: org.suburb ?? '',
      state: org.state ?? '',
      postcode: org.postcode ?? '',
    }
  }
  const user = await prisma.user.findUnique({
    where: { id: key.id },
    select: { name: true, email: true, phone: true, technicianProfile: true },
  })
  if (!user) return null
  const p = user.technicianProfile
  return {
    businessName: p?.businessName ?? '',
    phone: p?.businessPhone ?? user.phone ?? '',
    email: p?.businessEmail ?? '',
    abn: p?.abn ?? '',
    suburb: p?.baseSuburb ?? '',
    state: p?.baseState ?? '',
    postcode: p?.basePostcode ?? '',
  }
}

/** Where quote and booking alerts go: the business's alert email, else the owner's login. */
export async function businessAlertEmail(key: BusinessKey): Promise<string | null> {
  if (key.kind === 'organization') {
    const org = await prisma.organization.findUnique({
      where: { id: key.id },
      select: {
        email: true,
        members: { where: { role: 'OWNER' }, select: { user: { select: { email: true } } }, take: 1 },
      },
    })
    return org?.email ?? org?.members[0]?.user.email ?? null
  }
  const user = await prisma.user.findUnique({
    where: { id: key.id },
    select: { email: true, technicianProfile: { select: { businessEmail: true } } },
  })
  return user?.technicianProfile?.businessEmail ?? user?.email ?? null
}

/**
 * The account that works a booked job: the sole trader, or the
 * organisation's owner. Jobs have a single worker, so an organisation's
 * bookings land with whoever owns it.
 */
export async function businessWorker(
  key: BusinessKey
): Promise<{ userId: string; technicianId: string | null } | null> {
  const userId =
    key.kind === 'user'
      ? key.id
      : ((
          await prisma.organizationMember.findFirst({
            where: { organizationId: key.id, role: 'OWNER' },
            select: { userId: true },
          })
        )?.userId ?? null)
  if (!userId) return null
  const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } })
  return { userId, technicianId: profile?.id ?? null }
}
