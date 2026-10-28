/**
 * Business separation and quoting, against a real Postgres database.
 * Runs only when QUOTING_DB_TESTS=1 and DATABASE_URL points at a scratch
 * database (CI has no database, so it is skipped there). Every row it
 * creates carries a unique run id and is removed afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Role, SubscriptionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { Session } from '@/lib/auth'
import { companyContext, createOwnBusiness, deleteOwnRule, getOwnRule, listOwnQuotes, listOwnRules, requireCompanyContext, saveOwnProfile, saveOwnRule, setOwnRuleActive, type CompanyContext } from './company'
import { listParticipatingCompanies, publicCompany, quoteRequestForViewer, ratingsFor, requestQuotes, QUOTE_REQUESTS_PER_HOUR } from './quotes'
import type { RuleInput } from './pricing'

const run = `qt${Date.now().toString(36)}`
const enabled = process.env.QUOTING_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL)

const rule = (over: Partial<RuleInput> = {}): RuleInput => ({
  category: 'GARAGE_DOOR', brand: 'DoorWorks', widthMinMm: 2300, widthMaxMm: 2500, heightMinMm: 2300, heightMaxMm: 2500,
  motorIncluded: true, motorBrand: null, installation: 'INCLUDED', installPriceCents: null, priceCents: 300000, gst: 'EXCLUSIVE', notes: null, ...over,
})
const doorRequest = { category: 'GARAGE_DOOR' as const, brand: null, motorChoice: 'ANY' as const, motorBrand: null, widthMm: 2400, heightMm: 2400, installationWanted: true }

describe.skipIf(!enabled)('automated quoting against the database', () => {
  const s: Record<string, Session> = {}
  let a: CompanyContext, b: CompanyContext

  async function user(key: string, role: Role, subscribed: boolean) {
    const u = await prisma.user.create({ data: { email: `${key}.${run}@test.doorlink`, name: `${key} Tester`, role } })
    if (subscribed) {
      const plan = await prisma.subscriptionPlan.upsert({ where: { code: `test-trade-${run}` }, update: {}, create: { code: `test-trade-${run}`, name: 'Test trade', interval: 'MONTH', priceCents: 999 } })
      await prisma.subscription.create({ data: { userId: u.id, planId: plan.id, status: SubscriptionStatus.ACTIVE } })
    }
    s[key] = { userId: u.id, email: u.email, name: u.name, role, organizationId: null }
  }

  beforeAll(async () => {
    await user('tradeA', Role.TECHNICIAN, true)
    await user('tradeB', Role.SUPPLIER, true)
    await user('unsubscribed', Role.TECHNICIAN, false)
    await user('customer', Role.CUSTOMER, false)
    await user('admin', Role.ADMIN, false)
    a = await createOwnBusiness(s.tradeA, `Alpha Doors ${run}`)
    b = await createOwnBusiness(s.tradeB, `Bravo Gates ${run}`)
  })

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { endsWith: `.${run}@test.doorlink` } }, select: { id: true } })
    await prisma.organization.deleteMany({ where: { name: { endsWith: run } } })
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
    await prisma.subscriptionPlan.deleteMany({ where: { code: `test-trade-${run}` } })
    await prisma.$disconnect()
  })

  it('only subscribed trade accounts can manage pricing; customers and platform admins cannot', async () => {
    expect(a.organizationId).not.toBe(b.organizationId)
    await expect(companyContext(s.customer)).rejects.toThrow(/Not permitted/)
    await expect(companyContext(s.admin)).rejects.toThrow(/Not permitted/)
    await expect(companyContext(s.unsubscribed)).rejects.toThrow(/trade subscription/)
    await expect(companyContext(null)).rejects.toThrow(/Sign-in required/)
    expect((await companyContext(s.tradeA))?.organizationId).toBe(a.organizationId)
  })

  it('saves rules, refuses overlaps (inclusive ends), allows adjacent ranges', async () => {
    const first = await saveOwnRule(a, rule())
    expect(first.ok).toBe(true)
    const clash = await saveOwnRule(a, rule({ widthMinMm: 2500, widthMaxMm: 2700 }))
    expect(clash.ok).toBe(false)
    if (!clash.ok) expect(clash.errors.overlap).toMatch(/overlaps/)
    expect((await saveOwnRule(a, rule({ widthMinMm: 2501, widthMaxMm: 2700, priceCents: 350000 }))).ok).toBe(true)
    expect((await saveOwnRule(a, rule({ brand: 'Gliderol', priceCents: 280000 }))).ok).toBe(true)
    // The other business may price the same product and size: separation is per business.
    expect((await saveOwnRule(b, rule({ priceCents: 310000 }))).ok).toBe(true)
  })

  it('two overlapping saves at the same moment cannot both succeed', async () => {
    const results = await Promise.all([1, 2, 3].map(() => saveOwnRule(a, rule({ category: 'SHOP_SHUTTER', brand: null, motorIncluded: false, widthMinMm: 1000, widthMaxMm: 2000 }))))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })

  it('a business cannot read, change, switch off or delete another business\'s rules', async () => {
    const bRules = await listOwnRules(b)
    const target = bRules[0]
    expect((await listOwnRules(a)).every((r) => r.organizationId === a.organizationId)).toBe(true)
    expect(await getOwnRule(a, target.id)).toBeNull()
    await expect(saveOwnRule(a, rule({ priceCents: 1 }), target.id)).rejects.toThrow(/not found/)
    await expect(setOwnRuleActive(a, target.id, false)).rejects.toThrow(/not found/)
    await expect(deleteOwnRule(a, target.id)).rejects.toThrow(/not found/)
    const after = await prisma.pricingRule.findUnique({ where: { id: target.id } })
    expect(after).toMatchObject({ priceCents: 310000, isActive: true, organizationId: b.organizationId })
  })

  it('quotes only from companies that have switched quoting on', async () => {
    expect((await listParticipatingCompanies('GARAGE_DOOR')).some((c) => c.id === a.organizationId)).toBe(false)
    const none = await requestQuotes(s.customer, { request: doorRequest, design: null, organizationIds: [a.organizationId], shareContact: false })
    expect(none.ok).toBe(false)
    expect((await saveOwnProfile(a, { about: 'Garage doors', serviceArea: 'Brisbane', phone: null, website: 'alpha.example.com.au', abn: null, quotingEnabled: true })).ok).toBe(true)
    expect((await saveOwnProfile(b, { about: null, serviceArea: null, phone: null, website: null, abn: '1234', quotingEnabled: true })).ok).toBe(false)
    expect((await saveOwnProfile(b, { about: null, serviceArea: null, phone: null, website: null, abn: null, quotingEnabled: true })).ok).toBe(true)
    const listed = await listParticipatingCompanies('GARAGE_DOOR')
    expect(listed.map((c) => c.id)).toEqual(expect.arrayContaining([a.organizationId, b.organizationId]))
    expect(JSON.stringify(listed)).not.toMatch(/priceCents|widthMinMm/)
    expect((await listParticipatingCompanies('FENCE')).some((c) => c.id === a.organizationId)).toBe(false)
  })

  it('generates the configured price with GST, and explains unavailable sizes', async () => {
    const r = await requestQuotes(s.customer, { request: doorRequest, design: { kind: 'door', spec: { productType: 'roller', widthMm: 2400, heightMm: 2400 } }, organizationIds: [a.organizationId, b.organizationId, 'not-a-real-org'], shareContact: false })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.skipped).toBe(1)
    const view = await quoteRequestForViewer(s.customer, r.requestId)
    expect(view?.viewer).toBe('customer')
    const alpha = view!.quotes.filter((q) => q.organizationId === a.organizationId)
    expect(alpha.map((q) => [q.brand, q.totalCents])).toEqual([['Gliderol', 308000], ['DoorWorks', 330000]])
    expect(alpha[1]).toMatchObject({ basePriceCents: 300000, gstCents: 30000, exGstCents: 300000, gst: 'EXCLUSIVE', installation: 'INCLUDED', motorIncluded: true })
    expect(view!.quotes.find((q) => q.organizationId === b.organizationId)?.totalCents).toBe(341000)

    const out = await requestQuotes(s.customer, { request: { ...doorRequest, widthMm: 3200 }, design: null, organizationIds: [a.organizationId], shareContact: false })
    const outView = await quoteRequestForViewer(s.customer, (out as { requestId: string }).requestId)
    expect(outView!.quotes).toHaveLength(1)
    expect(outView!.quotes[0]).toMatchObject({ status: 'UNAVAILABLE', totalCents: null })
    expect(outView!.quotes[0].unavailableReason).toMatch(/outside the sizes/)
  })

  it('each company sees only its own quotes on a request, and contact details only when shared', async () => {
    const r = await requestQuotes(s.customer, { request: doorRequest, design: null, organizationIds: [a.organizationId, b.organizationId], shareContact: false })
    const id = (r as { requestId: string }).requestId
    const asA = await quoteRequestForViewer(s.tradeA, id)
    expect(asA?.viewer).toBe('company')
    expect(asA!.quotes.every((q) => q.organizationId === a.organizationId)).toBe(true)
    expect(asA!.customer).toBeNull()
    const asB = await quoteRequestForViewer(s.tradeB, id)
    expect(asB!.quotes.every((q) => q.organizationId === b.organizationId)).toBe(true)
    expect(await quoteRequestForViewer(s.unsubscribed, id)).toBeNull()
    expect(await quoteRequestForViewer(s.admin, id)).toBeNull()
    expect(await quoteRequestForViewer(null, id)).toBeNull()
    expect((await listOwnQuotes(a)).every((q) => q.organizationId === a.organizationId)).toBe(true)

    const shared = await requestQuotes(s.customer, { request: doorRequest, design: null, organizationIds: [a.organizationId], shareContact: true })
    const sharedView = await quoteRequestForViewer(s.tradeA, (shared as { requestId: string }).requestId)
    expect(sharedView!.customer?.email).toBe(s.customer.email)
  })

  it('a quote keeps its figures after the company changes its price', async () => {
    const r = await requestQuotes(s.customer, { request: { ...doorRequest, brand: 'DoorWorks' }, design: null, organizationIds: [a.organizationId], shareContact: false })
    const id = (r as { requestId: string }).requestId
    const dw = (await listOwnRules(a)).find((x) => x.brand === 'DoorWorks' && x.widthMinMm === 2300)!
    expect((await saveOwnRule(a, rule({ priceCents: 999900 }), dw.id)).ok).toBe(true)
    const view = await quoteRequestForViewer(s.customer, id)
    expect(view!.quotes[0].totalCents).toBe(330000)
    const fresh = await requestQuotes(s.customer, { request: { ...doorRequest, brand: 'DoorWorks' }, design: null, organizationIds: [a.organizationId], shareContact: false })
    expect((await quoteRequestForViewer(s.customer, (fresh as { requestId: string }).requestId))!.quotes[0].totalCents).toBe(1099890)
  })

  it('a company whose subscription lapses stops quoting', async () => {
    await prisma.subscription.updateMany({ where: { userId: s.tradeB.userId }, data: { status: SubscriptionStatus.CANCELLED } })
    expect((await listParticipatingCompanies('GARAGE_DOOR')).some((c) => c.id === b.organizationId)).toBe(false)
    const r = await requestQuotes(s.customer, { request: doorRequest, design: null, organizationIds: [b.organizationId], shareContact: false })
    expect(r.ok).toBe(false)
    await expect(requireCompanyContext(s.tradeB)).rejects.toThrow(/trade subscription/)
    expect(await publicCompany(b.organizationId)).toBeNull()
  })

  it('ratings come only from real reviews; none means no rating', async () => {
    expect((await ratingsFor([a.organizationId])).get(a.organizationId)).toEqual({ average: null, count: 0 })
    const job = await prisma.job.create({ data: { reference: `JOB-${run}`, description: 'test', customerId: s.customer.userId, workerId: s.tradeA.userId, status: 'COMPLETED' } as never })
    await prisma.workerReview.create({ data: { jobId: job.id, authorId: s.customer.userId, workerId: s.tradeA.userId, rating: 5, body: 'Great' } })
    expect((await ratingsFor([a.organizationId])).get(a.organizationId)).toEqual({ average: 5, count: 1 })
    const pub = await publicCompany(a.organizationId)
    expect(pub!.reviews[0]).toMatchObject({ rating: 5, author: 'customer' })
    expect(pub!.categories).toContain('GARAGE_DOOR')
  })

  it('limits how many quote requests one account can send in an hour', async () => {
    const sent = await prisma.quoteRequest.count({ where: { customerId: s.customer.userId } })
    for (let i = sent; i < QUOTE_REQUESTS_PER_HOUR; i++) await requestQuotes(s.customer, { request: doorRequest, design: null, organizationIds: [a.organizationId], shareContact: false })
    const r = await requestQuotes(s.customer, { request: doorRequest, design: null, organizationIds: [a.organizationId], shareContact: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form).toMatch(/last hour/)
  })
})
