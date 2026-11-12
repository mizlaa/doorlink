import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { logoOptions } from '@/lib/branding/logo'
import { invoiceTotals, lineAmountCents } from './money'
import { renderInvoicePdf, renderReceiptPdf, WATERMARK_OPACITY } from './pdf'
import type { InvoiceSnapshot } from './snapshot'

/** A long, realistic invoice: 40 lines (the maximum), many wrapping onto two or three rows. */
export function longSnapshot(): InvoiceSnapshot {
  const raw = Array.from({ length: 40 }, (_, i) => ({
    kind: (['DOOR', 'MOTOR', 'PART', 'LABOUR'] as const)[i % 4],
    description:
      i % 3 === 0
        ? `Unit ${i + 1}: sectional garage door 4.8 × 2.1 m, Charcoal, matte, four sections with a right-side window stack, supplied and fitted with new tracks, springs and weather seals`
        : `Unit ${i + 1}: replacement part and labour for strata block ${Math.ceil((i + 1) / 4)}`,
    quantityX100: 100 + (i % 3) * 50,
    unitPriceCents: 12500 + i * 1375,
    gstApplicable: true,
  }))
  const lines = raw.map((line) => ({ ...line, amountCents: lineAmountCents(line) }))
  return {
    version: 1,
    number: 'INV-0042',
    title: 'Tax invoice',
    issueDate: '2026-11-12',
    dueDate: '2026-11-26',
    issuer: { name: 'Harbourside Garage Doors', abn: '51824753556', addressLine: 'Unit 4, 18 Harbour Road', suburb: 'Parramatta', state: 'NSW', postcode: '2150', phone: '0412 555 019', email: 'accounts@example.com', brandColour: '#1F4033' },
    customer: { name: 'Strata Plan 81234', email: 'strata@example.com', phone: null },
    property: { addressLine: '1–40 Example Street', suburb: 'Parramatta', state: 'NSW', postcode: '2150' },
    jobReference: 'DL-JOB-SAMPLE1',
    lines,
    gstRegistered: true,
    pricesIncludeGst: true,
    totals: invoiceTotals(lines, { gstRegistered: true, pricesIncludeGst: true }),
    currency: 'AUD',
    notes: 'Works completed across all forty garages over three visits.',
    terms: 'Payment due within 14 days of the invoice date.',
    footer: 'Pay by bank transfer: BSB 062-000, account 1234 5678, reference your invoice number.',
  }
}

const logo = { kind: 'design' as const, design: logoOptions('Harbourside Garage Doors')[1] }

describe('invoice watermark', () => {
  it('appears on every page without adding or removing pages', async () => {
    const snapshot = longSnapshot()
    const issuedAt = new Date('2026-11-12T00:00:00Z')
    const withLogo = await renderInvoicePdf({ snapshot, logo, payments: [], issuedAt, voided: false })
    const withoutLogo = await renderInvoicePdf({ snapshot, logo: null, payments: [], issuedAt, voided: false })
    const a = await PDFDocument.load(withLogo)
    const b = await PDFDocument.load(withoutLogo)
    expect(a.getPageCount()).toBeGreaterThanOrEqual(3)
    expect(a.getPageCount()).toBe(b.getPageCount())
    // Each page carries a graphics state at the watermark's opacity; the plain invoice has none.
    const text = Buffer.from(withLogo).toString('latin1')
    const states = text.match(new RegExp(`/ca ${WATERMARK_OPACITY}\\b`, 'g')) ?? []
    expect(states.length).toBeGreaterThan(0)
    expect(Buffer.from(withoutLogo).toString('latin1')).not.toMatch(new RegExp(`/ca ${WATERMARK_OPACITY}\\b`))
    for (const page of a.getPages()) {
      const resources = page.node.Resources()
      expect(resources?.toString()).toMatch(/ExtGState/)
    }
  })

  it('leaves the receipt to a single page', async () => {
    const snapshot = longSnapshot()
    const receipt = await renderReceiptPdf({ snapshot, logo, payment: { receiptNumber: 1, amountCents: 1000, method: 'BANK_TRANSFER', date: '2026-11-12', reference: null }, balanceAfterCents: 0, receivedAt: new Date('2026-11-12T00:00:00Z') })
    expect((await PDFDocument.load(receipt)).getPageCount()).toBe(1)
  })
})
