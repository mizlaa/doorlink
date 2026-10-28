/**
 * Turns form fields into the typed inputs the pricing engine checks.
 * Parsing only: the engine decides what is valid. Unreadable values become
 * NaN or null so the engine reports them instead of guessing.
 */
import type { GstTreatment, InstallationMode, MotorChoice, QuoteProductCategory } from '@prisma/client'
import { formatMoney } from '@/lib/money'
import type { CustomerRequest, PriceBreakdown, RuleInput } from './pricing'
import { CATEGORY_IDS } from './catalogue'

/** "3000", "3,000.5", "$3000.50" → cents, exactly (no floating point). Anything else → NaN. Empty → null. */
export function parseDollars(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!s) return null
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return Number.NaN
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}

/** "2,300" or "2300" → 2300. Decimals and anything else → NaN. */
export function parseMm(raw: FormDataEntryValue | null): number {
  if (typeof raw !== 'string') return Number.NaN
  const s = raw.trim().replace(/,/g, '')
  return /^\d{1,6}$/.test(s) ? Number(s) : Number.NaN
}

const text = (raw: FormDataEntryValue | null) => (typeof raw === 'string' && raw.trim() ? raw.trim() : null)
const oneOf = <T extends string>(raw: FormDataEntryValue | null, values: readonly T[], fallback: T) => (values.includes(raw as T) ? (raw as T) : fallback)

export function ruleFromForm(form: FormData): RuleInput {
  const installation = oneOf<InstallationMode>(form.get('installation'), ['INCLUDED', 'EXTRA', 'NOT_OFFERED'], 'INCLUDED')
  return {
    category: oneOf<QuoteProductCategory>(form.get('category'), CATEGORY_IDS, 'GARAGE_DOOR'),
    brand: text(form.get('brand')),
    widthMinMm: parseMm(form.get('widthMinMm')),
    widthMaxMm: parseMm(form.get('widthMaxMm')),
    heightMinMm: parseMm(form.get('heightMinMm')),
    heightMaxMm: parseMm(form.get('heightMaxMm')),
    motorIncluded: form.get('motorIncluded') === 'yes',
    motorBrand: form.get('motorIncluded') === 'yes' ? text(form.get('motorBrand')) : null,
    installation,
    // A price left in the field while installation is not "extra" is ignored rather than refused.
    installPriceCents: installation === 'EXTRA' ? parseDollars(form.get('installPrice')) : null,
    priceCents: parseDollars(form.get('price')) ?? Number.NaN,
    gst: oneOf<GstTreatment>(form.get('gst'), ['EXCLUSIVE', 'INCLUSIVE'], 'EXCLUSIVE'),
    notes: text(form.get('notes')),
  }
}

export function requestFromForm(form: FormData): CustomerRequest {
  return {
    category: oneOf<QuoteProductCategory>(form.get('category'), CATEGORY_IDS, 'GARAGE_DOOR'),
    brand: text(form.get('brand')),
    motorChoice: oneOf<MotorChoice>(form.get('motorChoice'), ['NONE', 'ANY', 'BRAND'], 'NONE'),
    motorBrand: text(form.get('motorBrand')),
    widthMm: parseMm(form.get('widthMm')),
    heightMm: parseMm(form.get('heightMm')),
    installationWanted: form.get('installationWanted') === 'yes',
  }
}

export const GST_LABELS: Record<GstTreatment, string> = { EXCLUSIVE: 'plus GST', INCLUSIVE: 'including GST' }
export const INSTALLATION_LABELS: Record<InstallationMode, string> = {
  INCLUDED: 'Installation included',
  EXTRA: 'Installation at extra cost',
  NOT_OFFERED: 'Supply only (no installation)',
}

/** How a rule's price reads in a list, e.g. "$3,000.00 + GST". */
export function priceLabel(priceCents: number, gst: GstTreatment): string {
  return gst === 'EXCLUSIVE' ? `${formatMoney(priceCents)} + GST` : `${formatMoney(priceCents)} inc. GST`
}

export function breakdownRows(p: Pick<PriceBreakdown, 'basePriceCents' | 'installPriceCents' | 'gst' | 'exGstCents' | 'gstCents' | 'totalCents'>): Array<{ label: string; value: string; total?: boolean }> {
  const rows: Array<{ label: string; value: string; total?: boolean }> = [
    { label: p.gst === 'EXCLUSIVE' ? 'Price (ex GST)' : 'Price (inc GST)', value: formatMoney(p.basePriceCents) },
  ]
  if (p.installPriceCents > 0) rows.push({ label: p.gst === 'EXCLUSIVE' ? 'Installation (ex GST)' : 'Installation (inc GST)', value: formatMoney(p.installPriceCents) })
  rows.push({ label: 'Total ex GST', value: formatMoney(p.exGstCents) })
  rows.push({ label: p.gst === 'EXCLUSIVE' ? 'GST (10%) added' : 'GST (10%) included', value: formatMoney(p.gstCents) })
  rows.push({ label: 'Total inc GST', value: formatMoney(p.totalCents), total: true })
  return rows
}
