import type { InvoiceTotals, LineKindId } from './money'

/**
 * The frozen copy of an invoice, taken when it is issued. Everything
 * printed on the document comes from here, so changing the logo, the
 * business address or a price later can never alter an invoice a customer
 * already holds. Payments are not part of it: they are added as they
 * arrive and shown beside it.
 */
export interface InvoiceSnapshot {
  version: 1
  number: string
  /** "Tax invoice" only for a GST-registered business with an ABN. */
  title: 'Tax invoice' | 'Invoice'
  /** Local dates in the business's zone, "YYYY-MM-DD". */
  issueDate: string
  dueDate: string | null
  issuer: {
    name: string
    abn: string | null
    addressLine: string | null
    suburb: string | null
    state: string | null
    postcode: string | null
    phone: string | null
    email: string | null
    brandColour: string
  }
  customer: { name: string; email: string | null; phone: string | null }
  property: { addressLine: string; suburb: string; state: string; postcode: string } | null
  jobReference: string | null
  lines: Array<{
    kind: LineKindId
    description: string
    quantityX100: number
    unitPriceCents: number
    amountCents: number
    gstApplicable: boolean
  }>
  gstRegistered: boolean
  pricesIncludeGst: boolean
  totals: InvoiceTotals
  currency: string
  notes: string | null
  terms: string
  footer: string | null
}

export function parseSnapshot(raw: unknown): InvoiceSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as InvoiceSnapshot
  return s.version === 1 && typeof s.number === 'string' && Array.isArray(s.lines) ? s : null
}

export function termsText(days: number): string {
  return days <= 0 ? 'Payment due on receipt.' : `Payment due within ${days} day${days === 1 ? '' : 's'} of the invoice date.`
}

/** "11 November 2026" from "2026-11-11". */
export function longDate(date: string | null): string {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CARD_IN_PERSON: 'Card (in person)',
  CHEQUE: 'Cheque',
  STRIPE: 'Card (online)',
  OTHER: 'Other',
}

export interface PaymentLine {
  receiptNumber: number | null
  amountCents: number
  method: string
  /** Local date, "YYYY-MM-DD". */
  date: string
  reference: string | null
}
