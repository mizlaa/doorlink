import { describe, expect, it } from 'vitest'
import { findOverlap, gstOn, gstWithin, priceRule, quoteFromRules, ruleMatches, rulesOverlap, validateRequest, validateRule, type CustomerRequest, type RuleInput, type StoredRule } from './pricing'
import { brandKey, categoryFromSlug, CATEGORIES, GATE_MOTOR_BRANDS, WINDOW_SHUTTER_MOTOR_BRANDS } from './catalogue'

const input = (over: Partial<RuleInput> = {}): RuleInput => ({
  category: 'GARAGE_DOOR', brand: 'DoorWorks', widthMinMm: 2300, widthMaxMm: 2500, heightMinMm: 2300, heightMaxMm: 2500,
  motorIncluded: true, motorBrand: null, installation: 'INCLUDED', installPriceCents: null, priceCents: 300000, gst: 'EXCLUSIVE', notes: null, ...over,
})
let n = 0
const stored = (over: Partial<RuleInput & { isActive: boolean; id: string }> = {}): StoredRule => {
  const v = validateRule(input(over))
  if (!v.ok) throw new Error(JSON.stringify(v.errors))
  return { ...v.rule, id: over.id ?? `r${n++}`, isActive: over.isActive ?? true }
}
const req = (over: Partial<CustomerRequest> = {}): CustomerRequest => ({ category: 'GARAGE_DOOR', brand: null, motorChoice: 'ANY', motorBrand: null, widthMm: 2400, heightMm: 2400, installationWanted: true, ...over })

describe('the client example: DoorWorks 2,300–2,500 mm, motor and installation included, $3,000 + GST', () => {
  it('quotes $3,000 + $300 GST = $3,300', () => {
    const [q] = quoteFromRules([stored()], req())
    expect(q.status).toBe('QUOTED')
    expect(q.price).toMatchObject({ basePriceCents: 300000, installPriceCents: 0, exGstCents: 300000, gstCents: 30000, totalCents: 330000, installationLine: 'included' })
  })
  it('includes both boundaries and excludes one millimetre either side', () => {
    const rule = stored()
    for (const [w, h] of [[2300, 2300], [2500, 2500], [2300, 2500], [2500, 2300]]) expect(ruleMatches(rule, req({ widthMm: w, heightMm: h }))).toBe(true)
    for (const [w, h] of [[2299, 2400], [2501, 2400], [2400, 2299], [2400, 2501]]) expect(ruleMatches(rule, req({ widthMm: w, heightMm: h }))).toBe(false)
  })
  it('is not a universal price: another company with no rules gets no quote', () => {
    const [q] = quoteFromRules([], req())
    expect(q.status).toBe('UNAVAILABLE')
    expect(q.reason).toMatch(/no automated pricing for garage doors/)
  })
})

describe('GST', () => {
  it('adds 10% to exclusive prices, rounding half a cent up', () => {
    expect(gstOn(100)).toBe(10)
    expect(gstOn(105)).toBe(11) // 10.5c
    expect(gstOn(104)).toBe(10) // 10.4c
    expect(gstOn(99999)).toBe(10000) // 9999.9c
  })
  it('takes one eleventh out of inclusive prices', () => {
    expect(gstWithin(330000)).toBe(30000)
    expect(gstWithin(1100)).toBe(100)
    expect(gstWithin(100)).toBe(9) // 9.09c
    expect(gstWithin(odd(5))).toBe(Math.round(5 / 11)) // 0.45 → 0
    expect(gstWithin(odd(6))).toBe(1) // 0.545 → 1
  })
  it('inclusive: total is the configured price and the parts add up', () => {
    const p = priceRule({ priceCents: 330000, installation: 'INCLUDED', installPriceCents: null, gst: 'INCLUSIVE' }, true)
    expect(p).toMatchObject({ totalCents: 330000, gstCents: 30000, exGstCents: 300000 })
  })
  it('the ex-GST amount plus GST always equals the total', () => {
    for (let c = 1; c < 5000; c += 7) for (const gst of ['INCLUSIVE', 'EXCLUSIVE'] as const) {
      const p = priceRule({ priceCents: c, installation: 'EXTRA', installPriceCents: 333, gst }, true)
      expect(p.exGstCents + p.gstCents).toBe(p.totalCents)
    }
  })
})
const odd = (x: number) => x

describe('installation', () => {
  it('adds an extra installation price when the customer wants installation, with GST on both', () => {
    const r = stored({ installation: 'EXTRA', installPriceCents: 50000 })
    const [q] = quoteFromRules([r], req())
    expect(q.price).toMatchObject({ installPriceCents: 50000, exGstCents: 350000, gstCents: 35000, totalCents: 385000, installationLine: 'extra' })
    const [s] = quoteFromRules([r], req({ installationWanted: false }))
    expect(s.price).toMatchObject({ installPriceCents: 0, totalCents: 330000, installationLine: 'not-requested' })
  })
  it('supply-only rules do not quote a customer who wants installation, and say why', () => {
    const r = stored({ installation: 'NOT_OFFERED' })
    const [q] = quoteFromRules([r], req())
    expect(q.status).toBe('UNAVAILABLE')
    expect(q.reason).toMatch(/supply only/)
    expect(quoteFromRules([r], req({ installationWanted: false }))[0].status).toBe('QUOTED')
  })
  it('installation-included prices are not reduced when installation is not wanted', () => {
    const [q] = quoteFromRules([stored()], req({ installationWanted: false }))
    expect(q.price).toMatchObject({ totalCents: 330000, installationLine: 'included-not-removable' })
  })
})

describe('motors', () => {
  it('matches "no motor", "any motor" and a named motor only against the right rules', () => {
    const none = stored({ motorIncluded: false }), withMotor = stored({ motorIncluded: true, motorBrand: 'Merlin' })
    expect(ruleMatches(none, req({ motorChoice: 'NONE' }))).toBe(true)
    expect(ruleMatches(withMotor, req({ motorChoice: 'NONE' }))).toBe(false)
    expect(ruleMatches(none, req({ motorChoice: 'ANY' }))).toBe(false)
    expect(ruleMatches(withMotor, req({ motorChoice: 'BRAND', motorBrand: ' merlin ' }))).toBe(true)
    expect(ruleMatches(withMotor, req({ motorChoice: 'BRAND', motorBrand: 'Somfy' }))).toBe(false)
  })
  it('gates take only the client-listed gate motors, stored with canonical spelling', () => {
    expect(GATE_MOTOR_BRANDS).toEqual(['Beninca', 'BFT', 'FAAC', 'Merlin', 'Grifo', 'Nice V8'])
    const ok = validateRule(input({ category: 'SLIDING_GATE', brand: null, motorBrand: 'faac' }))
    expect(ok.ok && ok.rule.motorBrand).toBe('FAAC')
    const bad = validateRule(input({ category: 'SWING_GATE', brand: null, motorBrand: 'Somfy' }))
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.errors.motorBrand).toMatch(/Beninca, BFT, FAAC, Merlin, Grifo, Nice V8/)
    expect(validateRule(input({ category: 'PEDESTRIAN_GATE', brand: null, motorBrand: null })).ok).toBe(false)
  })
  it('window shutters take only CWB, Maximum, Somfy, Simu and Nice', () => {
    expect(WINDOW_SHUTTER_MOTOR_BRANDS).toEqual(['CWB', 'Maximum', 'Somfy', 'Simu', 'Nice'])
    expect(validateRule(input({ category: 'WINDOW_SHUTTER', brand: null, motorBrand: 'somfy' })).ok).toBe(true)
    expect(validateRule(input({ category: 'WINDOW_SHUTTER', brand: null, motorBrand: 'FAAC' })).ok).toBe(false)
    expect(validateRequest(req({ category: 'WINDOW_SHUTTER', motorChoice: 'BRAND', motorBrand: 'Nice V8' })).ok).toBe(false)
  })
  it('a gate motor is only quoted where the company priced that motor for that gate type', () => {
    const rules = [stored({ category: 'SLIDING_GATE', brand: null, motorBrand: 'BFT', widthMinMm: 3000, widthMaxMm: 5000, heightMinMm: 1000, heightMaxMm: 2000 })]
    const r = req({ category: 'SLIDING_GATE', motorChoice: 'BRAND', motorBrand: 'BFT', widthMm: 4000, heightMm: 1800 })
    expect(quoteFromRules(rules, r)[0].status).toBe('QUOTED')
    const swing = quoteFromRules(rules, { ...r, category: 'SWING_GATE' })[0]
    expect(swing.status).toBe('UNAVAILABLE')
    const faac = quoteFromRules(rules, { ...r, motorBrand: 'FAAC' })[0]
    expect(faac.reason).toMatch(/no automated price with a FAAC motor/)
  })
  it('fences never take a motor', () => {
    expect(validateRule(input({ category: 'FENCE', brand: null, motorIncluded: true })).ok).toBe(false)
    expect(validateRule(input({ category: 'FENCE', brand: null, motorIncluded: false })).ok).toBe(true)
    expect(validateRequest(req({ category: 'FENCE', motorChoice: 'ANY' })).ok).toBe(false)
  })
  it('garage doors and shop shutters accept any named motor brand or none', () => {
    expect(validateRule(input({ motorBrand: 'Any Brand Co' })).ok).toBe(true)
    expect(validateRule(input({ category: 'SHOP_SHUTTER', brand: null, motorBrand: null })).ok).toBe(true)
  })
})

describe('brands', () => {
  it('match case- and space-insensitively, and no preference matches every brand', () => {
    const rules = [stored({ brand: 'DoorWorks' }), stored({ brand: 'Gliderol', priceCents: 280000 })]
    const both = quoteFromRules(rules, req())
    expect(both.map((q) => q.rule?.brand)).toEqual(['Gliderol', 'DoorWorks']) // cheapest first
    const one = quoteFromRules(rules, req({ brand: '  doorworks ' }))
    expect(one).toHaveLength(1)
    expect(one[0].rule?.brand).toBe('DoorWorks')
    expect(quoteFromRules(rules, req({ brand: 'Other' }))[0].reason).toMatch(/no automated pricing for the Other brand/)
  })
  it('DoorWorks and Gliderol are only examples', () => {
    expect(categoryFromSlug('garage-door')?.brandExamples).toEqual(['DoorWorks', 'Gliderol'])
    expect(validateRule(input({ brand: 'Some Other Maker' })).ok).toBe(true)
  })
})

describe('overlapping ranges', () => {
  it('detects overlap in both dimensions, including a shared boundary', () => {
    const a = stored()
    expect(rulesOverlap(a, stored({ widthMinMm: 2400, widthMaxMm: 2600, heightMinMm: 2400, heightMaxMm: 2600 }))).toBe(true)
    expect(rulesOverlap(a, stored({ widthMinMm: 2500, widthMaxMm: 2700 }))).toBe(true) // 2,500 is in both
    expect(rulesOverlap(a, stored({ widthMinMm: 2501, widthMaxMm: 2700 }))).toBe(false)
    expect(rulesOverlap(a, stored({ heightMinMm: 2501, heightMaxMm: 3000 }))).toBe(false)
  })
  it('different brand, motor or product never overlap', () => {
    const a = stored()
    expect(rulesOverlap(a, stored({ brand: 'Gliderol' }))).toBe(false)
    expect(rulesOverlap(a, stored({ motorIncluded: false }))).toBe(false)
    expect(rulesOverlap(a, stored({ motorBrand: 'Merlin' }))).toBe(false)
    expect(rulesOverlap(a, stored({ category: 'SHOP_SHUTTER', brand: 'DoorWorks' }))).toBe(false)
    expect(rulesOverlap(a, stored({ brand: 'doorworks ' }))).toBe(true) // same brand, different spelling
  })
  it('ignores inactive rules and the rule being edited', () => {
    const a = stored({ id: 'a' }), off = stored({ id: 'off', isActive: false })
    expect(findOverlap(stored(), [off])).toBeNull()
    expect(findOverlap(a, [a], 'a')).toBeNull()
    expect(findOverlap(stored(), [a])?.id).toBe('a')
  })
  it('if overlapping rules exist anyway, no price is picked', () => {
    const [q] = quoteFromRules([stored(), stored({ priceCents: 1 })], req())
    expect(q.status).toBe('UNAVAILABLE')
    expect(q.reason).toMatch(/more than one price/)
  })
})

describe('missing and invalid input', () => {
  it('rejects invalid ranges, prices and installation settings with a message each', () => {
    const v = validateRule(input({ widthMinMm: 2600, widthMaxMm: 2500, heightMinMm: 0, priceCents: 0, installation: 'EXTRA', installPriceCents: null }))
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.errors.widthMinMm).toMatch(/must not be more/)
      expect(v.errors.heightMinMm).toMatch(/whole millimetres/)
      expect(v.errors.priceCents).toMatch(/above \$0/)
      expect(v.errors.installPriceCents).toMatch(/installation price/)
    }
    expect(validateRule(input({ priceCents: 12.5 })).ok).toBe(false)
    expect(validateRule(input({ widthMinMm: 2300.5 })).ok).toBe(false)
    expect(validateRule(input({ installPriceCents: 100 })).ok).toBe(false)
    expect(validateRule(input({ motorIncluded: false, motorBrand: 'Merlin' })).ok).toBe(false)
  })
  it('rejects invalid customer measurements', () => {
    for (const w of [0, -5, 99, 50001, 2400.5, Number.NaN]) expect(validateRequest(req({ widthMm: w })).ok).toBe(false)
    expect(validateRequest(req({ motorChoice: 'BRAND', motorBrand: '' })).ok).toBe(false)
    expect(validateRequest(req()).ok).toBe(true)
  })
  it('explains measurements outside every range', () => {
    const [q] = quoteFromRules([stored()], req({ widthMm: 3000 }))
    expect(q.reason).toMatch(/3000 × 2400 mm\) are outside the sizes/)
  })
  it('inactive rules never quote', () => {
    expect(quoteFromRules([stored({ isActive: false })], req())[0].status).toBe('UNAVAILABLE')
  })
})

describe('catalogue', () => {
  it('covers the seven product categories with no prohibited wording', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual(['Garage door', 'Sliding gate', 'Swing gate', 'Pedestrian gate', 'Fence', 'Window shutter', 'Shop shutter'])
    expect(JSON.stringify(CATEGORIES).toLowerCase()).not.toContain('secur')
    expect(brandKey('  Nice   V8 ')).toBe('nice v8')
  })
})
