import { describe, expect, it } from 'vitest'
import { balanceCents, formatQuantity, invoiceNumberLabel, invoiceTotals, lineAmountCents, parseDollars, parseQuantity, paymentState, readLines } from './money'

const line = (unitPriceCents: number, quantityX100 = 100, gstApplicable = true) => ({ unitPriceCents, quantityX100, gstApplicable })

describe('invoiceTotals', () => {
  it('takes one-eleventh as GST when prices include it', () => {
    // $3,300.00 inc GST: $300.00 GST, $3,000.00 before it.
    expect(invoiceTotals([line(330_000)], { gstRegistered: true, pricesIncludeGst: true })).toEqual({
      subtotalExGstCents: 300_000,
      gstCents: 30_000,
      totalCents: 330_000,
      taxableExGstCents: 300_000,
      gstFreeCents: 0,
    })
  })

  it('adds 10% when prices exclude it', () => {
    expect(invoiceTotals([line(300_000)], { gstRegistered: true, pricesIncludeGst: false })).toMatchObject({ gstCents: 30_000, totalCents: 330_000 })
  })

  it('works GST on the invoice total, not line by line', () => {
    // Three lines of $0.05 ex GST: 0.5c each would round to 1c a line (3c);
    // on the total it is 1.5c, which rounds to 2c.
    const totals = invoiceTotals([line(5), line(5), line(5)], { gstRegistered: true, pricesIncludeGst: false })
    expect(totals.gstCents).toBe(2)
    expect(totals.totalCents).toBe(17)
  })

  it('keeps GST-free lines out of the GST', () => {
    const totals = invoiceTotals([line(110_000), line(50_000, 100, false)], { gstRegistered: true, pricesIncludeGst: true })
    expect(totals).toEqual({ subtotalExGstCents: 150_000, gstCents: 10_000, totalCents: 160_000, taxableExGstCents: 100_000, gstFreeCents: 50_000 })
  })

  it('charges no GST for a business that is not registered', () => {
    const totals = invoiceTotals([line(110_000), line(8_950, 150)], { gstRegistered: false, pricesIncludeGst: true })
    expect(totals.gstCents).toBe(0)
    expect(totals.totalCents).toBe(110_000 + 13_425)
    expect(totals.subtotalExGstCents).toBe(totals.totalCents)
  })

  it('multiplies quantities in hundredths without drift', () => {
    expect(lineAmountCents({ quantityX100: 150, unitPriceCents: 9_500 })).toBe(14_250)
    expect(lineAmountCents({ quantityX100: 33, unitPriceCents: 1_000 })).toBe(330)
    expect(lineAmountCents({ quantityX100: 250, unitPriceCents: 1_999 })).toBe(4_998) // 49.975 rounds up
  })

  it('handles a discount line', () => {
    const totals = invoiceTotals([line(220_000), line(-22_000)], { gstRegistered: true, pricesIncludeGst: true })
    expect(totals).toMatchObject({ totalCents: 198_000, gstCents: 18_000 })
  })

  it('always adds up: subtotal + GST = total', () => {
    for (const cents of [1, 9, 10, 11, 99, 1_001, 123_457, 9_999_999]) {
      for (const pricesIncludeGst of [true, false]) {
        const t = invoiceTotals([line(cents), line(cents * 3, 250)], { gstRegistered: true, pricesIncludeGst })
        expect(t.subtotalExGstCents + t.gstCents).toBe(t.totalCents)
      }
    }
  })
})

describe('paymentState', () => {
  const base = { status: 'ISSUED', totalCents: 100_000, paidCents: 0, dueDate: new Date('2026-11-20T00:00:00Z') }
  const now = new Date('2026-11-11T00:00:00Z')
  it('tracks unpaid, partly paid, paid and overdue', () => {
    expect(paymentState(base, now)).toBe('UNPAID')
    expect(paymentState({ ...base, paidCents: 40_000 }, now)).toBe('PARTLY_PAID')
    expect(paymentState({ ...base, paidCents: 100_000 }, now)).toBe('PAID')
    expect(paymentState({ ...base, paidCents: 40_000 }, new Date('2026-11-21T00:00:00Z'))).toBe('OVERDUE')
    // Paid in full is paid, however late.
    expect(paymentState({ ...base, paidCents: 100_000 }, new Date('2027-01-01T00:00:00Z'))).toBe('PAID')
    expect(paymentState({ ...base, status: 'DRAFT' }, now)).toBe('DRAFT')
    expect(paymentState({ ...base, status: 'VOID' }, now)).toBe('VOID')
  })
  it('never shows a negative balance', () => {
    expect(balanceCents({ totalCents: 100, paidCents: 150 })).toBe(0)
  })
})

describe('reading what people type', () => {
  it('parses dollars', () => {
    expect(parseDollars('1,250')).toBe(125_000)
    expect(parseDollars('$89.5')).toBe(8_950)
    expect(parseDollars('-40')).toBe(-4_000)
    expect(parseDollars('12.345')).toBeNull()
    expect(parseDollars('abc')).toBeNull()
  })
  it('parses quantities', () => {
    expect(parseQuantity('2')).toBe(200)
    expect(parseQuantity('1.5')).toBe(150)
    expect(parseQuantity('0')).toBeNull()
    expect(formatQuantity(150)).toBe('1.5')
    expect(formatQuantity(200)).toBe('2')
  })
  it('labels numbers', () => {
    expect(invoiceNumberLabel(42)).toBe('INV-0042')
    expect(invoiceNumberLabel(null)).toBe('Draft')
  })
  it('reads form lines, skipping blank rows and naming the bad one', () => {
    const form = new FormData()
    const add = (kind: string, description: string, quantity: string, price: string, gst = 'gst') => {
      form.append('line.kind', kind)
      form.append('line.description', description)
      form.append('line.quantity', quantity)
      form.append('line.price', price)
      form.append('line.gst', gst)
      form.append('line.stock', '')
    }
    add('DOOR', 'Sectional door 4800 × 2100', '1', '3,300')
    add('OTHER', '', '', '')
    add('LABOUR', 'Installation', '4.5', '95', 'free')
    const result = readLines(form)
    expect(result).toEqual({
      ok: true,
      lines: [
        { kind: 'DOOR', description: 'Sectional door 4800 × 2100', quantityX100: 100, unitPriceCents: 330_000, gstApplicable: true, stockItemId: null },
        { kind: 'LABOUR', description: 'Installation', quantityX100: 450, unitPriceCents: 9_500, gstApplicable: false, stockItemId: null },
      ],
    })
    add('PART', 'Remote', '1', 'lots')
    expect(readLines(form)).toEqual({ ok: false, error: 'Line 3: enter the price in dollars, like 1250 or 89.50.' })
  })
})
