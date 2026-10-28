import { describe, expect, it } from 'vitest'
import {
  gstBreakdown,
  matchRules,
  normaliseBrand,
  rulesConflict,
  type QuoteRequest,
  type RuleTerms,
} from './engine'
import { motorBrandsFor, requestFromSpec } from './products'
import { DEFAULT_SPEC, specForType } from '@/lib/configurator/options'

function rule(overrides: Partial<RuleTerms> = {}): RuleTerms {
  return {
    id: 'r1',
    product: 'GARAGE_DOOR',
    productStyle: null,
    productBrand: 'Gliderol',
    motorIncluded: true,
    motorBrand: null,
    installation: 'INCLUDED',
    installPriceCents: null,
    minWidthMm: 2300,
    maxWidthMm: 2500,
    minHeightMm: 2300,
    maxHeightMm: 2500,
    priceCents: 300000,
    gst: 'EXCLUSIVE',
    currency: 'AUD',
    note: null,
    active: true,
    ...overrides,
  }
}

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    product: 'GARAGE_DOOR',
    productStyle: 'sectional',
    widthMm: 2400,
    heightMm: 2400,
    brand: null,
    motorRequired: true,
    motorBrand: null,
    installRequired: true,
    ...overrides,
  }
}

describe('GST', () => {
  it('adds 10% to a price quoted plus GST', () => {
    // The client's example: $3,000 + GST.
    expect(gstBreakdown(300000, 'EXCLUSIVE')).toEqual({
      subtotalExGstCents: 300000,
      gstCents: 30000,
      totalIncGstCents: 330000,
    })
  })

  it('takes one eleventh out of a GST-inclusive price', () => {
    expect(gstBreakdown(330000, 'INCLUSIVE')).toEqual({
      subtotalExGstCents: 300000,
      gstCents: 30000,
      totalIncGstCents: 330000,
    })
  })

  it('rounds the GST cent half up and keeps the parts adding up', () => {
    // $10.05 + GST: 100.5 cents of GST rounds to 101.
    expect(gstBreakdown(1005, 'EXCLUSIVE')).toEqual({
      subtotalExGstCents: 1005,
      gstCents: 101,
      totalIncGstCents: 1106,
    })
    // $10.00 inc GST: 90.909… rounds to 91, leaving 909 ex GST.
    const inc = gstBreakdown(1000, 'INCLUSIVE')
    expect(inc).toEqual({ subtotalExGstCents: 909, gstCents: 91, totalIncGstCents: 1000 })
    expect(inc.subtotalExGstCents + inc.gstCents).toBe(inc.totalIncGstCents)
  })

  it('refuses fractional or negative amounts', () => {
    expect(() => gstBreakdown(10.5, 'EXCLUSIVE')).toThrow()
    expect(() => gstBreakdown(-1, 'EXCLUSIVE')).toThrow()
  })
})

describe('matchRules: sizes', () => {
  it('prices the client example exactly', () => {
    const result = matchRules(request(), [rule()])
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toMatchObject({ priceCents: 300000, gstCents: 30000, totalIncGstCents: 330000 })
  })

  it('includes both ends of a range', () => {
    for (const [w, h] of [
      [2300, 2300],
      [2500, 2500],
      [2300, 2500],
    ]) {
      expect(matchRules(request({ widthMm: w, heightMm: h }), [rule()]).available).toBe(true)
    }
  })

  it('does not price one millimetre outside a range', () => {
    expect(matchRules(request({ widthMm: 2299 }), [rule()])).toEqual({ available: false, reason: 'size' })
    expect(matchRules(request({ heightMm: 2501 }), [rule()])).toEqual({ available: false, reason: 'size' })
  })

  it('needs both width and height inside the same rule', () => {
    const wideShort = rule({
      id: 'a',
      minWidthMm: 2600,
      maxWidthMm: 3000,
      minHeightMm: 2000,
      maxHeightMm: 2200,
    })
    expect(matchRules(request({ widthMm: 2800, heightMm: 2400 }), [rule(), wideShort]).available).toBe(false)
  })

  it('never borrows a price from a neighbouring range', () => {
    const next = rule({ id: 'b', minWidthMm: 2600, maxWidthMm: 2800 })
    // 2550 falls in the gap between 2500 and 2600.
    expect(matchRules(request({ widthMm: 2550 }), [rule(), next])).toEqual({ available: false, reason: 'size' })
  })
})

describe('matchRules: configuration', () => {
  it('says the business does not offer the product at all', () => {
    expect(matchRules(request({ product: 'SLIDING_GATE' }), [rule()])).toEqual({
      available: false,
      reason: 'not-offered',
    })
  })

  it('ignores inactive rules', () => {
    expect(matchRules(request(), [rule({ active: false })]).available).toBe(false)
  })

  it('keeps motorised and manual prices apart', () => {
    expect(matchRules(request({ motorRequired: false }), [rule()])).toEqual({
      available: false,
      reason: 'configuration',
    })
    expect(matchRules(request(), [rule({ motorIncluded: false })]).available).toBe(false)
  })

  it('honours a requested motor brand, and any brand when none is asked for', () => {
    const bft = rule({ product: 'SLIDING_GATE', motorBrand: 'bft', productBrand: null })
    const gate = request({ product: 'SLIDING_GATE', productStyle: null })
    expect(matchRules({ ...gate, motorBrand: 'bft' }, [bft]).available).toBe(true)
    expect(matchRules({ ...gate, motorBrand: 'faac' }, [bft]).available).toBe(false)
    expect(matchRules({ ...gate, motorBrand: null }, [bft]).available).toBe(true)
    // A motor the business did not name does not satisfy a named request.
    expect(matchRules({ ...gate, motorBrand: 'bft' }, [rule({ ...bft, motorBrand: null })]).available).toBe(
      false
    )
  })

  it('honours a requested product brand, case and spacing aside', () => {
    expect(matchRules(request({ brand: '  gliderol ' }), [rule()]).available).toBe(true)
    expect(matchRules(request({ brand: 'DoorWorks' }), [rule()]).available).toBe(false)
    expect(normaliseBrand('Door  Works')).toBe(normaliseBrand('door works'))
  })

  it('limits a styled garage rule to its style', () => {
    const roller = rule({ productStyle: 'roller' })
    expect(matchRules(request({ productStyle: 'roller' }), [roller]).available).toBe(true)
    expect(matchRules(request({ productStyle: 'sectional' }), [roller]).available).toBe(false)
    expect(matchRules(request({ productStyle: 'tilt' }), [rule({ productStyle: null })]).available).toBe(true)
  })

  it('matches installation terms to what the customer wants', () => {
    const supplyOnly = rule({ installation: 'NOT_INCLUDED' })
    expect(matchRules(request({ installRequired: true }), [supplyOnly]).available).toBe(false)
    expect(matchRules(request({ installRequired: false }), [supplyOnly]).available).toBe(true)
    expect(matchRules(request({ installRequired: false }), [rule()]).available).toBe(false)
  })

  it('adds separately priced installation only when installation is wanted', () => {
    const separate = rule({ installation: 'SEPARATE', installPriceCents: 45000 })
    const installed = matchRules(request(), [separate])
    const supplied = matchRules(request({ installRequired: false }), [separate])
    expect(installed.available && installed.options[0]).toMatchObject({
      installPriceCents: 45000,
      subtotalExGstCents: 345000,
      gstCents: 34500,
      totalIncGstCents: 379500,
    })
    expect(supplied.available && supplied.options[0]).toMatchObject({
      installPriceCents: null,
      totalIncGstCents: 330000,
    })
  })

  it('lists every brand as an option, cheapest first, when there is no preference', () => {
    const doorworks = rule({ id: 'dw', productBrand: 'DoorWorks', priceCents: 280000 })
    const result = matchRules(request(), [rule(), doorworks])
    expect(result.available && result.options.map((o) => o.productBrand)).toEqual(['DoorWorks', 'Gliderol'])
  })

  it('compares options on the GST-inclusive total, whatever the GST setting', () => {
    const inc = rule({ id: 'inc', productBrand: 'A', priceCents: 320000, gst: 'INCLUSIVE' })
    const exc = rule({ id: 'exc', productBrand: 'B', priceCents: 300000, gst: 'EXCLUSIVE' })
    const result = matchRules(request(), [exc, inc])
    expect(result.available && result.options.map((o) => o.ruleId)).toEqual(['inc', 'exc'])
  })
})

describe('rulesConflict', () => {
  it('flags ranges that share even one boundary millimetre', () => {
    expect(rulesConflict(rule(), rule({ id: 'b', minWidthMm: 2500, maxWidthMm: 2700 }))).toBe(true)
    expect(rulesConflict(rule(), rule({ id: 'b', minWidthMm: 2501, maxWidthMm: 2700 }))).toBe(false)
  })

  it('needs the ranges to overlap in both directions', () => {
    expect(
      rulesConflict(
        rule(),
        rule({ id: 'b', minWidthMm: 2400, maxWidthMm: 2600, minHeightMm: 2600, maxHeightMm: 2800 })
      )
    ).toBe(false)
  })

  it('lets different brands, motors and products sit side by side', () => {
    expect(rulesConflict(rule(), rule({ id: 'b', productBrand: 'DoorWorks' }))).toBe(false)
    expect(rulesConflict(rule(), rule({ id: 'b', motorIncluded: false }))).toBe(false)
    expect(rulesConflict(rule(), rule({ id: 'b', product: 'SHOP_SHUTTER' }))).toBe(false)
  })

  it('treats an all-styles rule as overlapping a styled one', () => {
    expect(rulesConflict(rule(), rule({ id: 'b', productStyle: 'roller' }))).toBe(true)
    expect(rulesConflict(rule({ productStyle: 'tilt' }), rule({ id: 'b', productStyle: 'roller' }))).toBe(false)
  })

  it('compares installation by what each rule can serve', () => {
    expect(rulesConflict(rule(), rule({ id: 'b', installation: 'NOT_INCLUDED' }))).toBe(false)
    expect(rulesConflict(rule(), rule({ id: 'b', installation: 'SEPARATE', installPriceCents: 1 }))).toBe(true)
  })

  it('never compares a rule with itself or an inactive one', () => {
    expect(rulesConflict(rule(), rule())).toBe(false)
    expect(rulesConflict(rule(), rule({ id: 'b', active: false }))).toBe(false)
  })
})

describe('requestFromSpec', () => {
  it('turns a garage design into a styled garage door request with an opener', () => {
    expect(requestFromSpec(DEFAULT_SPEC, { brand: null, installRequired: true })).toMatchObject({
      product: 'GARAGE_DOOR',
      productStyle: 'sectional',
      motorRequired: true,
      motorBrand: null,
    })
    expect(
      requestFromSpec({ ...DEFAULT_SPEC, opener: 'none' }, { brand: null, installRequired: true }).motorRequired
    ).toBe(false)
  })

  it('carries the chosen gate motor brand, or none for a manual gate', () => {
    const gate = { ...specForType(DEFAULT_SPEC, 'sliding-gate'), motorBrand: 'bft' }
    expect(requestFromSpec(gate, { brand: null, installRequired: true })).toMatchObject({
      product: 'SLIDING_GATE',
      motorRequired: true,
      motorBrand: 'bft',
    })
    expect(
      requestFromSpec({ ...gate, operation: 'manual' }, { brand: null, installRequired: true })
    ).toMatchObject({
      motorRequired: false,
      motorBrand: null,
    })
  })

  it('keeps window and shop shutters distinct', () => {
    const shop = specForType(DEFAULT_SPEC, 'shop-shutter')
    expect(requestFromSpec(shop, { brand: null, installRequired: true })).toMatchObject({
      product: 'SHOP_SHUTTER',
      motorRequired: true,
      motorBrand: null,
    })
    const window = { ...specForType(DEFAULT_SPEC, 'window-shutter'), control: 'manual' }
    expect(requestFromSpec(window, { brand: null, installRequired: false })).toMatchObject({
      product: 'WINDOW_SHUTTER',
      motorRequired: false,
    })
  })
})

describe('motor brand lists', () => {
  it('offers the client’s gate brands, and no others', () => {
    expect(motorBrandsFor('SWING_GATE').map((b) => b.id)).toEqual([
      'beninca',
      'bft',
      'faac',
      'grifco',
      'merlin',
      'nice',
    ])
  })

  it('offers the client’s window shutter brands', () => {
    expect(
      motorBrandsFor('WINDOW_SHUTTER')
        .map((b) => b.id)
        .sort()
    ).toEqual(['cw-products', 'maxim', 'nice', 'simu', 'somfy'].sort())
  })

  it('has no fixed list for garage doors, shop shutters or fences', () => {
    expect(motorBrandsFor('GARAGE_DOOR')).toEqual([])
    expect(motorBrandsFor('SHOP_SHUTTER')).toEqual([])
    expect(motorBrandsFor('FENCE')).toEqual([])
  })
})
