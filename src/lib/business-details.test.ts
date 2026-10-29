import { describe, expect, it } from 'vitest'
import { formatAbn, isAuPhone, isValidAbn, readBusinessDetails } from './business-details'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}

const good = {
  businessName: 'Automated Shutters and Rollers',
  businessPhone: '0412 345 678',
  businessEmail: 'Quotes@Example.com.au',
  abn: '51 824 753 556',
  suburb: 'Parramatta',
  state: 'NSW',
  postcode: '2150',
}

describe('isValidAbn', () => {
  it('accepts a real ABN (the ATO’s own example) with or without spaces', () => {
    expect(isValidAbn('51 824 753 556')).toBe(true)
    expect(isValidAbn('51824753556')).toBe(true)
  })

  it('rejects a mistyped digit and the wrong length', () => {
    expect(isValidAbn('51 824 753 557')).toBe(false)
    expect(isValidAbn('5182475355')).toBe(false)
    expect(isValidAbn('abcdefghijk')).toBe(false)
  })

  it('formats an ABN the usual way', () => {
    expect(formatAbn('51824753556')).toBe('51 824 753 556')
  })
})

describe('isAuPhone', () => {
  it('accepts mobiles, landlines, +61 and 13/1300/1800 numbers', () => {
    for (const n of [
      '0412 345 678',
      '(02) 9876 5432',
      '+61 412 345 678',
      '131 450',
      '1300 123 456',
      '1800 123 456',
    ]) {
      expect(isAuPhone(n)).toBe(true)
    }
  })

  it('rejects things that are not Australian numbers', () => {
    for (const n of ['12345', '0112 345 678', '+1 415 555 0100', 'call me']) expect(isAuPhone(n)).toBe(false)
  })
})

describe('readBusinessDetails', () => {
  it('reads and tidies a complete form', () => {
    expect(readBusinessDetails(form(good))).toEqual({
      ok: true,
      data: {
        businessName: 'Automated Shutters and Rollers',
        phone: '0412 345 678',
        email: 'quotes@example.com.au',
        abn: '51824753556',
        suburb: 'Parramatta',
        state: 'NSW',
        postcode: '2150',
      },
    })
  })

  it('lets ABN and location be left blank', () => {
    const result = readBusinessDetails(form({ ...good, abn: '', suburb: '', state: '', postcode: '' }))
    expect(result.ok && result.data.abn).toBeNull()
  })

  it('names the first problem', () => {
    expect(readBusinessDetails(form({ ...good, businessName: '' }))).toMatchObject({
      ok: false,
      error: 'Enter your business name.',
    })
    expect(readBusinessDetails(form({ ...good, abn: '12 345 678 901' }))).toMatchObject({ ok: false })
    expect(readBusinessDetails(form({ ...good, businessPhone: '555' }))).toMatchObject({ ok: false })
    expect(readBusinessDetails(form({ ...good, postcode: '215' }))).toMatchObject({ ok: false })
    expect(readBusinessDetails(form({ ...good, state: 'XX' }))).toMatchObject({ ok: false })
  })

  it('reads namespaced sign-up fields', () => {
    const prefixed = Object.fromEntries(Object.entries(good).map(([k, v]) => [`biz_${k}`, v]))
    expect(readBusinessDetails(form(prefixed), 'biz_').ok).toBe(true)
  })
})
