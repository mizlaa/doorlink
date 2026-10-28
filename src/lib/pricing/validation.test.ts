import { describe, expect, it } from 'vitest'
import { parseMoney, readRuleForm } from './validation'

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData()
  const base: Record<string, string> = {
    product: 'GARAGE_DOOR',
    productStyle: '',
    productBrand: 'Gliderol',
    motorIncluded: 'yes',
    motorBrand: '',
    installation: 'INCLUDED',
    installPrice: '',
    minWidthMm: '2300',
    maxWidthMm: '2500',
    minHeightMm: '2300',
    maxHeightMm: '2500',
    price: '3000',
    gst: 'EXCLUSIVE',
    note: '',
    active: 'on',
  }
  for (const [key, value] of Object.entries({ ...base, ...overrides })) data.set(key, value)
  return data
}

describe('parseMoney', () => {
  it('reads dollars into cents without float error', () => {
    expect(parseMoney('3000')).toBe(300000)
    expect(parseMoney('$3,000.50')).toBe(300050)
    expect(parseMoney('19.99')).toBe(1999)
    expect(parseMoney('0.1')).toBe(10)
  })

  it('refuses anything that is not plain money', () => {
    expect(parseMoney('3000.505')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })
})

describe('readRuleForm', () => {
  it('accepts the client example', () => {
    const result = readRuleForm(form())
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        product: 'GARAGE_DOOR',
        productBrand: 'Gliderol',
        motorIncluded: true,
        installation: 'INCLUDED',
        minWidthMm: 2300,
        maxWidthMm: 2500,
        priceCents: 300000,
        gst: 'EXCLUSIVE',
        active: true,
      }),
    })
  })

  it('rejects inverted, fractional and out-of-bounds sizes', () => {
    expect(readRuleForm(form({ minWidthMm: '2600' })).ok).toBe(false)
    expect(readRuleForm(form({ maxHeightMm: '2500.5' })).ok).toBe(false)
    expect(readRuleForm(form({ minWidthMm: '50' })).ok).toBe(false)
    expect(readRuleForm(form({ maxWidthMm: 'wide' })).ok).toBe(false)
  })

  it('rejects a missing, zero or malformed price', () => {
    expect(readRuleForm(form({ price: '' })).ok).toBe(false)
    expect(readRuleForm(form({ price: '0' })).ok).toBe(false)
    expect(readRuleForm(form({ price: '30,00.123' })).ok).toBe(false)
  })

  it('requires a price for separately priced installation', () => {
    expect(readRuleForm(form({ installation: 'SEPARATE' })).ok).toBe(false)
    const ok = readRuleForm(form({ installation: 'SEPARATE', installPrice: '450' }))
    expect(ok.ok && ok.data.installPriceCents).toBe(45000)
  })

  it('drops an installation price that does not apply', () => {
    const result = readRuleForm(form({ installation: 'INCLUDED', installPrice: '450' }))
    expect(result.ok && result.data.installPriceCents).toBeNull()
  })

  it('only accepts listed motor brands for gates and window shutters', () => {
    expect(readRuleForm(form({ product: 'SLIDING_GATE', motorBrand: 'bft' })).ok).toBe(true)
    expect(readRuleForm(form({ product: 'SLIDING_GATE', motorBrand: 'dea' })).ok).toBe(false)
    expect(readRuleForm(form({ product: 'WINDOW_SHUTTER', motorBrand: 'somfy' })).ok).toBe(true)
    // Garage doors take the motor in the business's own words.
    const garage = readRuleForm(form({ motorBrand: 'Merlin MT60' }))
    expect(garage.ok && garage.data.motorBrand).toBe('Merlin MT60')
  })

  it('ignores a motor brand when no motor is included', () => {
    const result = readRuleForm(form({ product: 'SLIDING_GATE', motorIncluded: 'no', motorBrand: 'bft' }))
    expect(result.ok && result.data.motorBrand).toBeNull()
  })

  it('refuses a motor on a fence', () => {
    expect(readRuleForm(form({ product: 'FENCE', motorIncluded: 'yes' })).ok).toBe(false)
    expect(readRuleForm(form({ product: 'FENCE', motorIncluded: 'no' })).ok).toBe(true)
  })

  it('keeps garage styles to garage doors', () => {
    expect(readRuleForm(form({ productStyle: 'roller' }))).toMatchObject({
      ok: true,
      data: { productStyle: 'roller' },
    })
    expect(readRuleForm(form({ productStyle: 'rolling' })).ok).toBe(false)
    const gate = readRuleForm(form({ product: 'SWING_GATE', productStyle: 'roller' }))
    expect(gate.ok && gate.data.productStyle).toBeNull()
  })

  it('rejects unknown products and GST settings', () => {
    expect(readRuleForm(form({ product: 'BOAT' })).ok).toBe(false)
    expect(readRuleForm(form({ gst: 'MAYBE' })).ok).toBe(false)
  })
})
