import 'server-only'

/**
 * The business side of automated quoting: a participating company's own
 * price list, profile and the quotes it has issued.
 *
 * Every function takes a CompanyContext, and the only way to get one is
 * companyContext(session), which derives the organization from the
 * signed-in user's own membership. No function accepts an organization id
 * from a form or URL, and every query filters on ctx.organizationId, so a
 * business can never read or change another business's rules or quotes,
 * whatever ids it sends.
 */
import { OrgMemberRole, OrgType, Role, type PricingRule } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { Session } from '@/lib/auth'
import { requirePermission, RbacError } from '@/lib/rbac'
import { requireTradeSubscription } from '@/lib/trade-subscription'
import { findOverlap, validateRule, type RuleErrors, type RuleInput, type StoredRule } from './pricing'
import { categoryInfo } from './catalogue'

export interface CompanyContext {
  userId: string
  organizationId: string
  organizationName: string
  memberRole: OrgMemberRole
}

export class QuotingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuotingError'
  }
}

/** The signed-in user's business, or null when they have not set one up. Throws when they may not manage pricing. */
export async function companyContext(session: Session | null): Promise<CompanyContext | null> {
  const active = requirePermission(session, 'pricing:manage:own')
  await requireTradeSubscription(active)
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: active.userId },
    orderBy: { createdAt: 'asc' },
    include: { organization: { select: { id: true, name: true } } },
  })
  if (!membership) return null
  return { userId: active.userId, organizationId: membership.organization.id, organizationName: membership.organization.name, memberRole: membership.role }
}

export async function requireCompanyContext(session: Session | null): Promise<CompanyContext> {
  const ctx = await companyContext(session)
  if (!ctx) throw new RbacError('Set up your business before adding prices.', 403)
  return ctx
}

/**
 * Technician accounts are created without an organization. Pricing belongs
 * to a business, so a technician sets one up here and becomes its owner.
 */
export async function createOwnBusiness(session: Session | null, name: string): Promise<CompanyContext> {
  const active = requirePermission(session, 'pricing:manage:own')
  await requireTradeSubscription(active)
  const clean = name.trim().replace(/\s+/g, ' ')
  if (clean.length < 2 || clean.length > 120) throw new QuotingError('Enter your business name (2 to 120 characters).')
  const existing = await companyContext(active)
  if (existing) return existing
  const type = active.role === Role.SUPPLIER ? OrgType.SUPPLIER : active.role === Role.MANUFACTURER ? OrgType.MANUFACTURER : OrgType.TECHNICIAN_COMPANY
  const org = await prisma.organization.create({
    data: { name: clean, type, members: { create: { userId: active.userId, role: OrgMemberRole.OWNER } } },
  })
  return { userId: active.userId, organizationId: org.id, organizationName: org.name, memberRole: OrgMemberRole.OWNER }
}

export const toStored = (r: PricingRule): StoredRule => ({
  id: r.id, category: r.category, brand: r.brand, brandKey: r.brandKey, widthMinMm: r.widthMinMm, widthMaxMm: r.widthMaxMm,
  heightMinMm: r.heightMinMm, heightMaxMm: r.heightMaxMm, motorIncluded: r.motorIncluded, motorBrand: r.motorBrand,
  motorBrandKey: r.motorBrandKey, installation: r.installation, installPriceCents: r.installPriceCents, priceCents: r.priceCents,
  gst: r.gst, notes: r.notes, isActive: r.isActive,
})

export function listOwnRules(ctx: CompanyContext) {
  return prisma.pricingRule.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ category: 'asc' }, { brandKey: 'asc' }, { widthMinMm: 'asc' }, { heightMinMm: 'asc' }],
  })
}

export function getOwnRule(ctx: CompanyContext, id: string) {
  return prisma.pricingRule.findFirst({ where: { id, organizationId: ctx.organizationId } })
}

export type SaveRuleResult = { ok: true; id: string } | { ok: false; errors: RuleErrors }

const describeRange = (r: Pick<PricingRule, 'widthMinMm' | 'widthMaxMm' | 'heightMinMm' | 'heightMaxMm'>) =>
  `width ${r.widthMinMm}–${r.widthMaxMm} mm, height ${r.heightMinMm}–${r.heightMaxMm} mm`

/**
 * Creates a rule, or updates one of this business's rules when `id` is
 * given. Refuses a rule that overlaps another active rule for the same
 * product, brand and motor. The overlap check and the write run in one
 * transaction holding a per-business lock, so two saves at once cannot
 * both slip an overlapping rule in.
 */
export async function saveOwnRule(ctx: CompanyContext, input: RuleInput, id?: string): Promise<SaveRuleResult> {
  const v = validateRule(input)
  if (!v.ok) return v
  const rule = v.rule
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pricing:' + ctx.organizationId}))`
    let isActive = true
    if (id) {
      const current = await tx.pricingRule.findFirst({ where: { id, organizationId: ctx.organizationId } })
      if (!current) throw new QuotingError('That price rule was not found.')
      isActive = current.isActive
    }
    if (isActive) {
      const siblings = await tx.pricingRule.findMany({ where: { organizationId: ctx.organizationId, category: rule.category, isActive: true } })
      const clash = findOverlap({ ...rule }, siblings.map(toStored), id)
      if (clash) {
        return { ok: false as const, errors: { overlap: `This overlaps another active ${categoryInfo(rule.category).label.toLowerCase()} price for the same brand and motor (${describeRange(clash)}). Ranges include both ends, so adjust one range or turn the other rule off.` } }
      }
    }
    const data = {
      category: rule.category, brand: rule.brand, brandKey: rule.brandKey, widthMinMm: rule.widthMinMm, widthMaxMm: rule.widthMaxMm,
      heightMinMm: rule.heightMinMm, heightMaxMm: rule.heightMaxMm, motorIncluded: rule.motorIncluded, motorBrand: rule.motorBrand,
      motorBrandKey: rule.motorBrandKey, installation: rule.installation, installPriceCents: rule.installPriceCents,
      priceCents: rule.priceCents, gst: rule.gst, notes: rule.notes,
    }
    if (id) {
      await tx.pricingRule.updateMany({ where: { id, organizationId: ctx.organizationId }, data })
      return { ok: true as const, id }
    }
    const created = await tx.pricingRule.create({ data: { ...data, organizationId: ctx.organizationId } })
    return { ok: true as const, id: created.id }
  })
}

/** Turns one of this business's rules on or off. Turning on re-checks for overlaps. */
export async function setOwnRuleActive(ctx: CompanyContext, id: string, active: boolean): Promise<SaveRuleResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pricing:' + ctx.organizationId}))`
    const rule = await tx.pricingRule.findFirst({ where: { id, organizationId: ctx.organizationId } })
    if (!rule) throw new QuotingError('That price rule was not found.')
    if (active) {
      const siblings = await tx.pricingRule.findMany({ where: { organizationId: ctx.organizationId, category: rule.category, isActive: true } })
      const clash = findOverlap(toStored(rule), siblings.map(toStored), id)
      if (clash) return { ok: false as const, errors: { overlap: `It overlaps another active rule (${describeRange(clash)}). Change one of them first.` } }
    }
    await tx.pricingRule.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { isActive: active } })
    return { ok: true as const, id }
  })
}

export async function deleteOwnRule(ctx: CompanyContext, id: string): Promise<void> {
  const { count } = await prisma.pricingRule.deleteMany({ where: { id, organizationId: ctx.organizationId } })
  if (count === 0) throw new QuotingError('That price rule was not found.')
}

export function getOwnProfile(ctx: CompanyContext) {
  return prisma.companyProfile.findUnique({ where: { organizationId: ctx.organizationId } })
}

export interface ProfileInput {
  about: string | null
  serviceArea: string | null
  phone: string | null
  website: string | null
  abn: string | null
  quotingEnabled: boolean
}

export function validateProfile(input: ProfileInput): { ok: true; profile: ProfileInput } | { ok: false; errors: Partial<Record<keyof ProfileInput, string>> } {
  const errors: Partial<Record<keyof ProfileInput, string>> = {}
  const t = (v: string | null, max: number, key: keyof ProfileInput, label: string) => {
    const s = v?.trim() || null
    if (s && s.length > max) errors[key] = `Keep the ${label} under ${max} characters.`
    return s
  }
  const about = t(input.about, 2000, 'about', 'description')
  const serviceArea = t(input.serviceArea, 200, 'serviceArea', 'service area')
  const phone = t(input.phone, 30, 'phone', 'phone number')
  let website = t(input.website, 200, 'website', 'website')
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`
  if (website) {
    try {
      const u = new URL(website)
      if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) errors.website = 'Enter a website address such as example.com.au.'
    } catch {
      errors.website = 'Enter a website address such as example.com.au.'
    }
  }
  const abnRaw = t(input.abn, 20, 'abn', 'ABN')
  const abn = abnRaw ? abnRaw.replace(/\s/g, '') : null
  if (abn && !/^\d{11}$/.test(abn)) errors.abn = 'An ABN is 11 digits.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, profile: { about, serviceArea, phone, website, abn, quotingEnabled: Boolean(input.quotingEnabled) } }
}

export async function saveOwnProfile(ctx: CompanyContext, input: ProfileInput) {
  const v = validateProfile(input)
  if (!v.ok) return v
  await prisma.companyProfile.upsert({
    where: { organizationId: ctx.organizationId },
    create: { organizationId: ctx.organizationId, ...v.profile },
    update: v.profile,
  })
  return { ok: true as const }
}

/** Quotes this business has issued. Customer contact details only when the customer chose to share them. */
export async function listOwnQuotes(ctx: CompanyContext, take = 50) {
  const quotes = await prisma.autoQuote.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { request: { include: { customer: { select: { name: true, email: true } } } } },
  })
  return quotes.map(({ request: { customer, ...request }, ...quote }) => ({
    ...quote,
    request,
    customer: request.shareContact ? customer : null,
  }))
}

export type OwnQuote = Awaited<ReturnType<typeof listOwnQuotes>>[number]
