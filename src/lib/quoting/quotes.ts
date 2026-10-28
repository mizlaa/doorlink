import 'server-only'

/**
 * The customer side of automated quoting: finding participating
 * companies, requesting quotes and reading them back.
 *
 * Pricing rules are read here only to compute a quote, on the server, and
 * are never returned. What leaves this module is the quote itself, and a
 * quote is only shown to the customer who asked for it and to the company
 * that issued it (and that company sees only its own quotes on a request).
 */
import type { MotorChoice, Prisma, QuoteProductCategory } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { Session } from '@/lib/auth'
import { requirePermission } from '@/lib/rbac'
import { makeReference } from '@/lib/reference'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/entitlements'
import { quoteFromRules, validateRequest, type CustomerRequest, type RequestErrors } from './pricing'
import { toStored, QuotingError } from './company'
import { parseDesign } from './design'

/** Anti-scraping limit: how many quote requests one account may send per hour. */
export const QUOTE_REQUESTS_PER_HOUR = 20
/** How many companies one request may go to. */
export const MAX_COMPANIES_PER_REQUEST = 5

/** Businesses a customer can get an automated quote from: quoting switched on, a member with an active trade subscription. */
function participatingWhere(category?: QuoteProductCategory): Prisma.OrganizationWhereInput {
  return {
    companyProfile: { quotingEnabled: true },
    members: { some: { user: { subscriptions: { some: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES } } } } } },
    ...(category ? { pricingRules: { some: { category, isActive: true } } } : {}),
  }
}

export interface CompanyRating {
  average: number | null
  count: number
}

/**
 * Ratings come only from genuine WorkerReview rows: reviews customers left
 * on completed Doorlink jobs for technicians who belong to the business.
 * No reviews means no rating, never a default.
 */
export async function ratingsFor(organizationIds: string[]): Promise<Map<string, CompanyRating>> {
  const out = new Map<string, CompanyRating>(organizationIds.map((id) => [id, { average: null, count: 0 }]))
  if (!organizationIds.length) return out
  const members = await prisma.organizationMember.findMany({ where: { organizationId: { in: organizationIds } }, select: { organizationId: true, userId: true } })
  if (!members.length) return out
  const grouped = await prisma.workerReview.groupBy({
    by: ['workerId'],
    where: { workerId: { in: [...new Set(members.map((m) => m.userId))] } },
    _sum: { rating: true },
    _count: { _all: true },
  })
  const byWorker = new Map(grouped.map((g) => [g.workerId, { sum: g._sum.rating ?? 0, count: g._count._all }]))
  for (const id of organizationIds) {
    let sum = 0
    let count = 0
    for (const m of members) if (m.organizationId === id) {
      const r = byWorker.get(m.userId)
      if (r) { sum += r.sum; count += r.count }
    }
    out.set(id, { average: count ? Math.round((sum / count) * 10) / 10 : null, count })
  }
  return out
}

export async function listParticipatingCompanies(category?: QuoteProductCategory) {
  const orgs = await prisma.organization.findMany({
    where: participatingWhere(category),
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true,
      companyProfile: { select: { about: true, serviceArea: true, phone: true, website: true, abn: true } },
      pricingRules: { where: { isActive: true }, select: { category: true }, distinct: ['category'] },
    },
  })
  const ratings = await ratingsFor(orgs.map((o) => o.id))
  return orgs.map((o) => ({ id: o.id, name: o.name, profile: o.companyProfile, categories: o.pricingRules.map((r) => r.category), rating: ratings.get(o.id)! }))
}
export type ParticipatingCompany = Awaited<ReturnType<typeof listParticipatingCompanies>>[number]

/** A company's public profile. Only for participating companies; anything else reads as not found. */
export async function publicCompany(organizationId: string) {
  const org = await prisma.organization.findFirst({
    where: { id: organizationId, ...participatingWhere() },
    select: {
      id: true, name: true, createdAt: true,
      companyProfile: { select: { about: true, serviceArea: true, phone: true, website: true, abn: true } },
      pricingRules: { where: { isActive: true }, select: { category: true }, distinct: ['category'] },
      members: { select: { userId: true } },
    },
  })
  if (!org) return null
  const rating = (await ratingsFor([org.id])).get(org.id)!
  const reviews = await prisma.workerReview.findMany({
    where: { workerId: { in: org.members.map((m) => m.userId) } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, rating: true, body: true, workerReply: true, createdAt: true, author: { select: { name: true } } },
  })
  return {
    id: org.id,
    name: org.name,
    profile: org.companyProfile,
    categories: org.pricingRules.map((r) => r.category),
    rating,
    // First name only: the reviewer agreed to review a job, not to have their full name on a company page.
    reviews: reviews.map((r) => ({ ...r, author: r.author.name.split(' ')[0] || 'A customer' })),
  }
}

export interface QuoteRequestInput {
  request: CustomerRequest
  design: unknown
  organizationIds: string[]
  shareContact: boolean
}

export type RequestQuotesResult = { ok: true; requestId: string; skipped: number } | { ok: false; errors: RequestErrors & { companies?: string; form?: string } }

export async function requestQuotes(session: Session | null, input: QuoteRequestInput): Promise<RequestQuotesResult> {
  const active = requirePermission(session, 'quote:request')
  const v = validateRequest(input.request)
  if (!v.ok) return v
  const req = v.request
  const orgIds = [...new Set(input.organizationIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length < 64))]
  if (!orgIds.length) return { ok: false, errors: { companies: 'Choose at least one company.' } }
  if (orgIds.length > MAX_COMPANIES_PER_REQUEST) return { ok: false, errors: { companies: `Choose up to ${MAX_COMPANIES_PER_REQUEST} companies at a time.` } }

  const recent = await prisma.quoteRequest.count({ where: { customerId: active.userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } })
  if (recent >= QUOTE_REQUESTS_PER_HOUR) return { ok: false, errors: { form: `You have asked for ${QUOTE_REQUESTS_PER_HOUR} quotes in the last hour. Try again a little later.` } }

  const participating = await prisma.organization.findMany({ where: { id: { in: orgIds }, ...participatingWhere() }, select: { id: true } })
  const allowed = new Set(participating.map((o) => o.id))
  const rules = await prisma.pricingRule.findMany({ where: { organizationId: { in: [...allowed] }, category: req.category, isActive: true } })

  const quotes: Prisma.AutoQuoteCreateWithoutRequestInput[] = []
  for (const orgId of orgIds) {
    const organization = { connect: { id: orgId } }
    if (!allowed.has(orgId)) {
      // An unknown or non-participating id gets no row at all, so a
      // request cannot be used to attach records to arbitrary businesses.
      continue
    }
    for (const result of quoteFromRules(rules.filter((r) => r.organizationId === orgId).map(toStored), req)) {
      if (result.status === 'UNAVAILABLE') {
        quotes.push({ organization, status: 'UNAVAILABLE', unavailableReason: result.reason })
        continue
      }
      const { rule, price } = result
      quotes.push({
        organization, status: 'QUOTED', ruleId: rule.id, brand: rule.brand, motorIncluded: rule.motorIncluded, motorBrand: rule.motorBrand,
        installation: rule.installation, basePriceCents: price.basePriceCents, installPriceCents: price.installPriceCents, gst: price.gst,
        exGstCents: price.exGstCents, gstCents: price.gstCents, totalCents: price.totalCents, notes: rule.notes,
      })
    }
  }
  if (!quotes.length) return { ok: false, errors: { companies: 'None of those companies is taking automated quotes right now.' } }

  const created = await prisma.quoteRequest.create({
    data: {
      reference: makeReference('QTE'),
      customerId: active.userId,
      category: req.category,
      brand: req.brand,
      motorChoice: req.motorChoice as MotorChoice,
      motorBrand: req.motorBrand,
      widthMm: req.widthMm,
      heightMm: req.heightMm,
      installationWanted: req.installationWanted,
      design: parseDesign(req.category, input.design) as Prisma.InputJsonValue,
      shareContact: input.shareContact,
      quotes: { create: quotes },
    },
  })
  return { ok: true, requestId: created.id, skipped: orgIds.length - allowed.size }
}

/**
 * A request as the viewer may see it: the customer sees every quote on
 * it; a member of a quoting business sees only that business's quotes, and
 * the customer's name and email only if the customer chose to share them.
 * Anyone else gets null, which the page renders as not found.
 */
export async function quoteRequestForViewer(session: Session | null, requestId: string) {
  if (!session) return null
  const request = await prisma.quoteRequest.findUnique({
    where: { id: requestId },
    include: {
      customer: { select: { name: true, email: true } },
      quotes: { orderBy: [{ status: 'asc' }, { totalCents: 'asc' }], include: { organization: { select: { id: true, name: true } } } },
    },
  })
  if (!request) return null
  const { customer, ...rest } = request
  if (request.customerId === session.userId) return { viewer: 'customer' as const, ...rest, customer }
  const memberships = await prisma.organizationMember.findMany({ where: { userId: session.userId }, select: { organizationId: true } })
  const mine = new Set(memberships.map((m) => m.organizationId))
  const visible = request.quotes.filter((q) => mine.has(q.organizationId))
  if (!visible.length) return null
  return { viewer: 'company' as const, ...rest, quotes: visible, customer: request.shareContact ? customer : null }
}
export type ViewableQuoteRequest = NonNullable<Awaited<ReturnType<typeof quoteRequestForViewer>>>

export async function listOwnQuoteRequests(session: Session | null) {
  const active = requirePermission(session, 'quote:request')
  return prisma.quoteRequest.findMany({
    where: { customerId: active.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { quotes: { select: { status: true, totalCents: true, organization: { select: { name: true } } } } },
  })
}

/**
 * Product brands and motor brands participating companies currently price,
 * per category: real names from real rules, offered to customers as
 * choices. Names only; no sizes or prices.
 */
export async function optionsOffered(): Promise<Partial<Record<QuoteProductCategory, { brands: string[]; motorBrands: string[] }>>> {
  const rows = await prisma.pricingRule.findMany({
    where: { isActive: true, organization: participatingWhere() },
    select: { category: true, brand: true, brandKey: true, motorBrand: true, motorBrandKey: true },
    distinct: ['category', 'brandKey', 'motorBrandKey'],
  })
  const out: Partial<Record<QuoteProductCategory, { brands: string[]; motorBrands: string[] }>> = {}
  for (const r of rows) {
    const entry = (out[r.category] ??= { brands: [], motorBrands: [] })
    if (r.brand && !entry.brands.some((b) => b.toLowerCase() === r.brandKey)) entry.brands.push(r.brand)
    if (r.motorBrand && !entry.motorBrands.some((b) => b.toLowerCase() === r.motorBrandKey)) entry.motorBrands.push(r.motorBrand)
  }
  for (const e of Object.values(out)) { e!.brands.sort((a, b) => a.localeCompare(b)); e!.motorBrands.sort((a, b) => a.localeCompare(b)) }
  return out
}

export { QuotingError }
