import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SPEC, type DoorSpec } from '@/lib/configurator/options'
import type { RuleTerms } from '@/lib/pricing/engine'
import { COMPANIES, DEMO_ACCOUNTS, SEED_LISTINGS, SEED_MANUALS, SEED_REVIEWS, type DemoAccount } from '../src/demo/data'
import { getDemo, resetDemo, signInAs, signOut, update } from '../src/demo/store'
import { compareQuotes } from '../src/demo/flows'
import { submitQuoteAction } from '../src/actions/leads'
import { saveRuleAction } from '../src/actions/pricing'
import { registerAction, signInAction } from '../src/actions/auth'
import { setAdminPricingTarget } from '../src/demo/pricing-target'
import { reviewsFor } from '../src/demo/cards'

const account = (role: DemoAccount['role']) => DEMO_ACCOUNTS.find((a) => a.role === role)!

function compare(spec: DoorSpec = DEFAULT_SPEC, postcode = '2170') {
  const ref = compareQuotes({ spec, postcode, suburb: null, brand: null, installRequired: true, accessories: [] })
  return getDemo().quotes.filter((q) => q.comparisonRef === ref)
}

const cheapest = (quotes: ReturnType<typeof compare>) =>
  Math.min(...quotes.flatMap((q) => q.options.map((o) => o.totalIncGstCents)))

function ruleForm(rule: RuleTerms, priceCents: number): FormData {
  const data = new FormData()
  const dollars = (c: number | null | undefined) => (c === null || c === undefined ? '' : String(c / 100))
  data.set('id', rule.id)
  data.set('product', rule.product)
  data.set('productStyle', rule.productStyle ?? '')
  data.set('productBrand', rule.productBrand ?? '')
  data.set('productModel', rule.productModel ?? '')
  data.set('material', rule.material ?? '')
  data.set('priceType', rule.priceType ?? 'FIXED')
  data.set('motorIncluded', rule.motorIncluded ? 'yes' : 'no')
  data.set('motorBrand', rule.motorBrand ?? '')
  data.set('motorAddOn', dollars(rule.motorAddOnCents))
  data.set('installation', rule.installation)
  data.set('installPrice', dollars(rule.installPriceCents))
  data.set('minWidthMm', String(rule.minWidthMm))
  data.set('maxWidthMm', String(rule.maxWidthMm))
  data.set('minHeightMm', String(rule.minHeightMm))
  data.set('maxHeightMm', String(rule.maxHeightMm))
  data.set('price', dollars(priceCents))
  data.set('gst', rule.gst)
  data.set('note', rule.note ?? '')
  data.set('active', rule.active ? 'on' : '')
  return data
}

beforeEach(() => {
  signOut()
  resetDemo()
  signInAs(account('customer'))
})

describe('seed data', () => {
  it('has the five one-click demo accounts, all on the demo domain', () => {
    expect(DEMO_ACCOUNTS.map((a) => a.role).sort()).toEqual(['admin', 'customer', 'installer', 'manufacturer', 'supplier'])
    for (const a of DEMO_ACCOUNTS) {
      expect(a.email).toMatch(/@demo\.doorlink\.test$/)
      expect(a.password).toBe('Demo123!')
    }
  })

  it('populates businesses, reviews, listings and manuals', () => {
    expect(COMPANIES).toHaveLength(8)
    expect(SEED_REVIEWS.length).toBeGreaterThanOrEqual(20)
    expect(SEED_LISTINGS.length).toBeGreaterThanOrEqual(20)
    expect(SEED_MANUALS.length).toBeGreaterThanOrEqual(6)
    for (const company of COMPANIES) expect(reviewsFor(company.id, getDemo()).length).toBeGreaterThan(0)
  })
})

describe('installed quotes', () => {
  it('quotes the seeded 2400 × 2100 sectional door from at least four businesses', () => {
    const quotes = compare()
    expect(quotes.length).toBeGreaterThanOrEqual(4)
    for (const quote of quotes) {
      expect(quote.options.length).toBeGreaterThan(0)
      for (const option of quote.options) {
        // GST-inclusive totals that add up exactly.
        expect(option.totalIncGstCents).toBe(option.subtotalExGstCents + option.gstCents)
        expect(option.gstCents).toBeGreaterThan(0)
        expect(Math.abs(option.gstCents - Math.round(option.totalIncGstCents / 11))).toBeLessThanOrEqual(2)
      }
    }
  })

  it('is deterministic, and recomputes when the design changes', () => {
    const first = compare()
    const again = compare()
    expect(again.map((q) => q.options[0].totalIncGstCents)).toEqual(first.map((q) => q.options[0].totalIncGstCents))
    const wider = compare({ ...DEFAULT_SPEC, widthMm: 4800 })
    expect(cheapest(wider)).toBeGreaterThan(cheapest(first))
  })

  it('leaves out a business the admin suspends', () => {
    const before = compare()
    const suspended = before[0].companyId
    update((s) => {
      s.businessStatus[suspended] = 'SUSPENDED'
    })
    expect(compare().some((q) => q.companyId === suspended)).toBe(false)
  })

  it('uses an admin price edit in the very next comparison', async () => {
    const before = compare()
    const quote = before[0]
    const option = quote.options[0]
    const rule = getDemo().rules[quote.companyId].find((r) => r.id === option.ruleId)!

    signInAs(account('admin'))
    setAdminPricingTarget(quote.companyId)
    const result = await saveRuleAction({}, ruleForm(rule, rule.priceCents + 50_000))
    expect(result.error).toBeUndefined()

    signInAs(account('customer'))
    const after = compare().find((q) => q.companyId === quote.companyId)!
    const updated = after.options.find((o) => o.ruleId === rule.id)!
    expect(updated.totalIncGstCents).toBeGreaterThan(option.totalIncGstCents)
  })

  it('refuses a price that overlaps another one', async () => {
    signInAs(account('supplier'))
    const rules = getDemo().rules[account('supplier').companyId!]
    const [a] = rules
    const clash = { ...a, id: '' }
    const result = await saveRuleAction({}, ruleForm(clash, 123_400))
    expect(result.error).toMatch(/overlaps/)
  })
})

describe('job board', () => {
  it('lets the installer quote on an open job', async () => {
    const lead = getDemo().leads.find((l) => l.status === 'Open')!
    signInAs(account('installer'))
    const data = new FormData()
    data.set('leadId', lead.reference)
    data.set('amount', '640')
    data.set('message', 'Fixed price, includes parts and labour.')
    const result = await submitQuoteAction({}, data)
    expect(result).toEqual({ ok: true })
    const after = getDemo().leads.find((l) => l.reference === lead.reference)!
    expect(after.status).toBe('Quoted')
    expect(after.responses.some((r) => r.companyId === account('installer').companyId && r.priceAUD === 640)).toBe(true)
  })

  it('rejects a quote without a description', async () => {
    const lead = getDemo().leads[0]
    signInAs(account('installer'))
    const data = new FormData()
    data.set('leadId', lead.reference)
    data.set('amount', '640')
    data.set('message', 'short')
    expect((await submitQuoteAction({}, data)).error).toMatch(/at least 10 characters/)
  })

  it('only lets technicians quote', async () => {
    const data = new FormData()
    data.set('leadId', getDemo().leads[0].reference)
    data.set('amount', '640')
    data.set('message', 'Fixed price, includes parts and labour.')
    expect((await submitQuoteAction({}, data)).error).toMatch(/Only technicians/)
  })
})

describe('sign-up', () => {
  it('never keeps the password a visitor types', async () => {
    signOut()
    const data = new FormData()
    data.set('name', 'Sam Visitor')
    data.set('email', 'sam.visitor@example.test')
    data.set('password', 'a-real-looking-password')
    data.set('role', 'CUSTOMER')
    expect(await registerAction({}, data)).toEqual({})
    const account = getDemo().accounts.find((a) => a.email === 'sam.visitor@example.test')!
    expect(account.password).toBe('')
    expect(JSON.stringify(getDemo())).not.toContain('a-real-looking-password')

    signOut()
    const again = new FormData()
    again.set('email', 'sam.visitor@example.test')
    again.set('password', 'anything')
    await signInAction({}, again)
    expect(getDemo().session?.email).toBe('sam.visitor@example.test')
  })

  it('still checks the published demo passwords', async () => {
    signOut()
    const data = new FormData()
    data.set('email', 'admin@demo.doorlink.test')
    data.set('password', 'wrong')
    expect((await signInAction({}, data)).error).toMatch(/don.t match a demo account/)
  })
})

describe('reset', () => {
  it('restores the seed and keeps the visitor signed in', () => {
    compare()
    update((s) => {
      s.hiddenReviews.push(SEED_REVIEWS[0].id)
      s.businessStatus.company_01 = 'SUSPENDED'
    })
    resetDemo()
    const state = getDemo()
    expect(state.quotes).toHaveLength(0)
    expect(state.hiddenReviews).toHaveLength(0)
    expect(state.businessStatus.company_01).toBe('APPROVED')
    expect(state.session?.email).toBe(account('customer').email)
  })
})
