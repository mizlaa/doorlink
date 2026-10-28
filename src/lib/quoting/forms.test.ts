import { describe, expect, it } from 'vitest'
import { breakdownRows, parseDollars, parseMm, priceLabel, requestFromForm, ruleFromForm } from './forms'
import { priceRule, validateRule } from './pricing'

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('form parsing', () => {
  it('reads dollars to exact cents', () => {
    expect(parseDollars('3000')).toBe(300000)
    expect(parseDollars('$3,000.5')).toBe(300050)
    expect(parseDollars('0.07')).toBe(7)
    expect(parseDollars('19.99')).toBe(1999)
    expect(parseDollars('')).toBeNull()
    for (const bad of ['1.234', '-5', 'abc', '1e3', '3 000']) expect(parseDollars(bad)).toBeNaN()
  })
  it('reads whole millimetres only', () => {
    expect(parseMm('2,300')).toBe(2300)
    expect(parseMm('2300.5')).toBeNaN()
    expect(parseMm('')).toBeNaN()
  })
  it('builds the client example rule from a form', () => {
    const r = ruleFromForm(fd({ category: 'GARAGE_DOOR', brand: 'DoorWorks', widthMinMm: '2300', widthMaxMm: '2500', heightMinMm: '2300', heightMaxMm: '2500', motorIncluded: 'yes', motorBrand: '', installation: 'INCLUDED', installPrice: '200', price: '3000', gst: 'EXCLUSIVE' }))
    expect(r).toMatchObject({ brand: 'DoorWorks', priceCents: 300000, installPriceCents: null, motorIncluded: true, motorBrand: null, gst: 'EXCLUSIVE' })
    expect(validateRule(r).ok).toBe(true)
    expect(priceLabel(r.priceCents, r.gst)).toBe('$3,000.00 + GST')
  })
  it('a missing price is reported, never treated as zero', () => {
    const r = ruleFromForm(fd({ category: 'FENCE', widthMinMm: '1', widthMaxMm: '2', heightMinMm: '1', heightMaxMm: '2', installation: 'INCLUDED', gst: 'EXCLUSIVE' }))
    expect(r.priceCents).toBeNaN()
    expect(validateRule(r).ok).toBe(false)
  })
  it('unknown categories and options fall back to safe values', () => {
    const q = requestFromForm(fd({ category: 'TELEPORTER', motorChoice: 'MAGIC', widthMm: '2400', heightMm: '2100' }))
    expect(q).toMatchObject({ category: 'GARAGE_DOOR', motorChoice: 'NONE', installationWanted: false })
  })
  it('lists the price breakdown lines that add up', () => {
    const rows = breakdownRows(priceRule({ priceCents: 300000, installation: 'EXTRA', installPriceCents: 50000, gst: 'EXCLUSIVE' }, true))
    expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual(['Price (ex GST): $3,000.00', 'Installation (ex GST): $500.00', 'Total ex GST: $3,500.00', 'GST (10%) added: $350.00', 'Total inc GST: $3,850.00'])
  })
})
