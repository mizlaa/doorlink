import { isValidAbn } from '@/lib/business-details'
import { invoiceTotals, lineAmountCents, type LineKindId } from './money'
import { termsText, type InvoiceSnapshot } from './snapshot'

export interface SampleBrand {
  name: string
  abn: string | null
  addressLine: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  phone: string | null
  email: string | null
  brandColour: string
  gstRegistered: boolean
  invoiceTermsDays: number
  invoiceFooter: string | null
}

/**
 * A made-up invoice in the business's own brand, for the logo and settings
 * screens. It is labelled as a sample and never stored.
 */
export function sampleSnapshot(brand: SampleBrand, today: string): InvoiceSnapshot {
  const gstRegistered = brand.gstRegistered && !!brand.abn && isValidAbn(brand.abn)
  const raw: Array<{ kind: LineKindId; description: string; quantityX100: number; unitPriceCents: number; gstApplicable: boolean }> = [
    { kind: 'DOOR', description: 'Sectional garage door 4.8 × 2.1 m, Charcoal', quantityX100: 100, unitPriceCents: 245000, gstApplicable: true },
    { kind: 'MOTOR', description: 'Garage door opener with two remotes', quantityX100: 100, unitPriceCents: 89900, gstApplicable: true },
    { kind: 'INSTALLATION', description: 'Remove old door, supply and install', quantityX100: 100, unitPriceCents: 65000, gstApplicable: true },
  ]
  const lines = raw.map((line) => ({ ...line, amountCents: lineAmountCents(line), gstApplicable: gstRegistered && line.gstApplicable }))
  const [y, m, d] = today.split('-').map(Number)
  const due = new Date(Date.UTC(y, m - 1, d + brand.invoiceTermsDays)).toISOString().slice(0, 10)
  return {
    version: 1,
    number: 'SAMPLE',
    title: gstRegistered ? 'Tax invoice' : 'Invoice',
    issueDate: today,
    dueDate: due,
    issuer: { ...brand },
    customer: { name: 'Sample Customer', email: 'customer@example.com', phone: null },
    property: { addressLine: '12 Example Street', suburb: brand.suburb ?? 'Parramatta', state: brand.state ?? 'NSW', postcode: brand.postcode ?? '2150' },
    jobReference: null,
    lines,
    gstRegistered,
    pricesIncludeGst: true,
    totals: invoiceTotals(lines, { gstRegistered, pricesIncludeGst: true }),
    currency: 'AUD',
    notes: null,
    terms: termsText(brand.invoiceTermsDays),
    footer: brand.invoiceFooter,
  }
}
