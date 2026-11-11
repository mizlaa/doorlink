/**
 * Invoice arithmetic. Pure, in integer cents, and only ever run on the
 * server for anything that is stored or issued: the browser's running
 * total is a preview of this same function, never the source of truth.
 *
 * GST follows the ATO's rules for a tax invoice: 10%, worked on the
 * invoice total rather than line by line (the "total invoice rule"), and
 * rounded to the nearest cent. A business that is not registered for GST
 * charges none, and its document is an invoice, not a tax invoice.
 */

export const GST_RATE_PERCENT = 10

export const LINE_KINDS = [
  { id: 'DOOR', label: 'Door' },
  { id: 'MOTOR', label: 'Motor' },
  { id: 'PART', label: 'Part' },
  { id: 'INSTALLATION', label: 'Installation' },
  { id: 'LABOUR', label: 'Labour' },
  { id: 'OTHER', label: 'Other' },
] as const

export type LineKindId = (typeof LINE_KINDS)[number]['id']

export interface LineInput {
  kind: LineKindId
  description: string
  /** Hundredths: 150 is 1.5. */
  quantityX100: number
  unitPriceCents: number
  gstApplicable: boolean
  stockItemId?: string | null
}

export interface InvoiceTotals {
  /** Everything before GST. */
  subtotalExGstCents: number
  gstCents: number
  totalCents: number
  /** The part of the ex-GST subtotal that GST was charged on. */
  taxableExGstCents: number
  gstFreeCents: number
}

/** Half away from zero, so a refund line rounds the same way as a charge. */
function roundCents(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** One line's amount as typed: quantity × unit price. */
export function lineAmountCents(line: Pick<LineInput, 'quantityX100' | 'unitPriceCents'>): number {
  return roundCents((line.quantityX100 * line.unitPriceCents) / 100)
}

export function invoiceTotals(
  lines: Array<Pick<LineInput, 'quantityX100' | 'unitPriceCents' | 'gstApplicable'>>,
  options: { gstRegistered: boolean; pricesIncludeGst: boolean }
): InvoiceTotals {
  let taxable = 0
  let free = 0
  for (const line of lines) {
    const amount = lineAmountCents(line)
    if (options.gstRegistered && line.gstApplicable) taxable += amount
    else free += amount
  }
  if (!options.gstRegistered) {
    return { subtotalExGstCents: free, gstCents: 0, totalCents: free, taxableExGstCents: 0, gstFreeCents: free }
  }
  if (options.pricesIncludeGst) {
    // GST is one-eleventh of a GST-inclusive price.
    const gst = roundCents(taxable / 11)
    return {
      subtotalExGstCents: taxable - gst + free,
      gstCents: gst,
      totalCents: taxable + free,
      taxableExGstCents: taxable - gst,
      gstFreeCents: free,
    }
  }
  const gst = roundCents((taxable * GST_RATE_PERCENT) / 100)
  return { subtotalExGstCents: taxable + free, gstCents: gst, totalCents: taxable + free + gst, taxableExGstCents: taxable, gstFreeCents: free }
}

export type PaymentState = 'DRAFT' | 'VOID' | 'UNPAID' | 'PARTLY_PAID' | 'PAID' | 'OVERDUE'

/** Where an invoice stands, from what is owed, what has been confirmed as paid, and its due date. */
export function paymentState(invoice: { status: string; totalCents: number; paidCents: number; dueDate: Date | null }, now = new Date()): PaymentState {
  if (invoice.status === 'DRAFT') return 'DRAFT'
  if (invoice.status === 'VOID') return 'VOID'
  if (invoice.paidCents >= invoice.totalCents) return 'PAID'
  if (invoice.dueDate && invoice.dueDate.getTime() < now.getTime()) return 'OVERDUE'
  return invoice.paidCents > 0 ? 'PARTLY_PAID' : 'UNPAID'
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  DRAFT: 'Draft',
  VOID: 'Void',
  UNPAID: 'Unpaid',
  PARTLY_PAID: 'Partly paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
}

export function balanceCents(invoice: { totalCents: number; paidCents: number }): number {
  return Math.max(0, invoice.totalCents - invoice.paidCents)
}

/** "INV-0042". Numbers are per business and never reused. */
export function invoiceNumberLabel(number: number | null): string {
  return number === null ? 'Draft' : `INV-${String(number).padStart(4, '0')}`
}

export function receiptNumberLabel(number: number | null): string {
  return number === null ? '' : `RCT-${String(number).padStart(4, '0')}`
}

/** "1", "1.5", "0.25" from hundredths. */
export function formatQuantity(quantityX100: number): string {
  return (quantityX100 / 100).toFixed(2).replace(/\.?0+$/, '')
}

/** Dollars typed by a person ("1,250", "$89.5", "-40") to cents, or null. */
export function parseDollars(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null
  const negative = cleaned.startsWith('-')
  const [whole, fraction = ''] = cleaned.replace('-', '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return negative ? -cents : cents
}

/** A quantity typed by a person ("2", "1.5") to hundredths, or null. */
export function parseQuantity(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, '')
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const x100 = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return x100 > 0 ? x100 : null
}

export const MAX_LINES = 40

export type LinesResult = { ok: true; lines: LineInput[] } | { ok: false; error: string }

/**
 * Reads line items from a form: parallel `line.kind`, `line.description`,
 * `line.quantity`, `line.price`, `line.gst`, `line.stock` fields. Blank
 * rows are skipped; a half-filled row is an error that says which.
 */
export function readLines(formData: FormData): LinesResult {
  const all = (key: string) => formData.getAll(key).map((v) => String(v))
  const kinds = all('line.kind')
  const descriptions = all('line.description')
  const quantities = all('line.quantity')
  const prices = all('line.price')
  const gst = all('line.gst')
  const stock = all('line.stock')
  const lines: LineInput[] = []
  for (let i = 0; i < descriptions.length; i++) {
    const description = descriptions[i].trim()
    const price = (prices[i] ?? '').trim()
    if (description === '' && price === '') continue
    const n = lines.length + 1
    if (description === '') return { ok: false, error: `Line ${n} needs a description.` }
    if (description.length > 200) return { ok: false, error: `Line ${n}: keep the description under 200 characters.` }
    const unitPriceCents = parseDollars(price)
    if (unitPriceCents === null) return { ok: false, error: `Line ${n}: enter the price in dollars, like 1250 or 89.50.` }
    const quantityX100 = parseQuantity((quantities[i] ?? '1').trim() || '1')
    if (quantityX100 === null) return { ok: false, error: `Line ${n}: enter a quantity, like 1 or 1.5.` }
    const kind = LINE_KINDS.find((k) => k.id === kinds[i])?.id ?? 'OTHER'
    lines.push({ kind, description, quantityX100, unitPriceCents, gstApplicable: gst[i] !== 'free', stockItemId: stock[i] || null })
  }
  if (lines.length === 0) return { ok: false, error: 'Add at least one item.' }
  if (lines.length > MAX_LINES) return { ok: false, error: `An invoice holds up to ${MAX_LINES} lines.` }
  return { ok: true, lines }
}
