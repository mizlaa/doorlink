import 'server-only'

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, type RGB } from 'pdf-lib'
import { formatAbn } from '@/lib/business-details'
import { logoDrawing, type LogoDesign } from '@/lib/branding/logo'
import { formatQuantity, receiptNumberLabel } from './money'
import { longDate, PAYMENT_METHOD_LABELS, type InvoiceSnapshot, type PaymentLine } from './snapshot'

/**
 * The invoice and receipt PDFs, drawn from the frozen snapshot. A4, the
 * standard Helvetica faces (no font files to ship), the company's logo as
 * vector shapes or an embedded image, and nothing that isn't on the
 * snapshot or in the list of confirmed payments.
 */

export type LogoSource = { kind: 'image'; contentType: string; bytes: Uint8Array } | { kind: 'design'; design: LogoDesign } | null

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 46
const INK = rgb(0.09, 0.13, 0.19)
const MUTED = rgb(0.39, 0.44, 0.52)
const RULE = rgb(0.86, 0.89, 0.93)
const WHITE = rgb(1, 1, 1)

function hex(colour: string, fallback: RGB = INK): RGB {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(colour)
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : fallback
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)

/** The standard fonts cover Latin-1 and a few extras; anything else becomes a question mark instead of crashing the PDF. */
function safe(font: PDFFont, text: string): string {
  let out = ''
  for (const ch of text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += ch === '\n' ? ' ' : '?'
    }
  }
  return out
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    for (const word of safe(font, paragraph).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

interface Pen {
  doc: PDFDocument
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  y: number
}

function text(pen: Pen, value: string, x: number, y: number, options: { size?: number; bold?: boolean; colour?: RGB; align?: 'left' | 'right' } = {}) {
  const font = options.bold ? pen.bold : pen.regular
  const size = options.size ?? 9.5
  const clean = safe(font, value)
  const width = font.widthOfTextAtSize(clean, size)
  pen.page.drawText(clean, { x: options.align === 'right' ? x - width : x, y, size, font, color: options.colour ?? INK })
  return width
}

/** "12 Nov 2026" from "2026-11-12". */
function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

function rule(pen: Pen, y: number, x1 = MARGIN, x2 = A4[0] - MARGIN, colour: RGB = RULE, thickness = 0.8) {
  pen.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: colour })
}

function newPage(pen: Pen) {
  pen.page = pen.doc.addPage(A4)
  pen.y = A4[1] - MARGIN
}

/** Draws the logo with its top-left corner at (x, top), fitted inside a box. Returns the height used. */
async function drawLogo(pen: Pen, logo: LogoSource, x: number, top: number, maxWidth: number, maxHeight: number): Promise<number> {
  if (!logo) return 0
  if (logo.kind === 'image') {
    try {
      const image = logo.contentType === 'image/png' ? await pen.doc.embedPng(logo.bytes) : await pen.doc.embedJpg(logo.bytes)
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
      const width = image.width * scale
      const height = image.height * scale
      pen.page.drawImage(image, { x, y: top - height, width, height })
      return height
    } catch {
      return 0
    }
  }
  const drawing = logoDrawing(logo.design)
  const scale = Math.min(maxWidth / drawing.width, maxHeight / drawing.height)
  const path = (d: string, colour: string) => pen.page.drawSvgPath(d, { x, y: top, scale, color: hex(colour), borderWidth: 0 })
  for (const p of drawing.prims) {
    if (p.t === 'rect') {
      const r = Math.min(p.rx ?? 0, p.w / 2, p.h / 2)
      path(
        r > 0
          ? `M ${p.x + r} ${p.y} H ${p.x + p.w - r} A ${r} ${r} 0 0 1 ${p.x + p.w} ${p.y + r} V ${p.y + p.h - r} A ${r} ${r} 0 0 1 ${p.x + p.w - r} ${p.y + p.h} H ${p.x + r} A ${r} ${r} 0 0 1 ${p.x} ${p.y + p.h - r} V ${p.y + r} A ${r} ${r} 0 0 1 ${p.x + r} ${p.y} Z`
          : `M ${p.x} ${p.y} H ${p.x + p.w} V ${p.y + p.h} H ${p.x} Z`,
        p.fill
      )
    } else if (p.t === 'poly') {
      path(`M ${p.points.map(([px, py]) => `${px} ${py}`).join(' L ')} Z`, p.fill)
    } else if (p.t === 'circle') {
      pen.page.drawCircle({ x: x + p.cx * scale, y: top - p.cy * scale, size: p.r * scale, color: hex(p.fill) })
    } else if (p.t === 'line') {
      pen.page.drawLine({ start: { x: x + p.x1 * scale, y: top - p.y1 * scale }, end: { x: x + p.x2 * scale, y: top - p.y2 * scale }, thickness: p.width * scale, color: hex(p.stroke) })
    } else {
      const font = p.bold ? pen.bold : pen.regular
      const size = p.size * scale
      const clean = safe(font, p.text)
      const spacing = (p.spacing ?? 0) * scale
      const width = font.widthOfTextAtSize(clean, size) + spacing * Math.max(0, clean.length - 1)
      let cx = x + p.x * scale - (p.anchor === 'middle' ? width / 2 : p.anchor === 'end' ? width : 0)
      const cy = top - p.y * scale
      if (!spacing) pen.page.drawText(clean, { x: cx, y: cy, size, font, color: hex(p.fill) })
      else
        for (const ch of clean) {
          pen.page.drawText(ch, { x: cx, y: cy, size, font, color: hex(p.fill) })
          cx += font.widthOfTextAtSize(ch, size) + spacing
        }
    }
  }
  return drawing.height * scale
}

async function start(title: string, author: string, created: Date): Promise<Pen> {
  const doc = await PDFDocument.create()
  doc.setTitle(title)
  doc.setAuthor(author)
  doc.setCreator('Doorlink')
  doc.setProducer('Doorlink')
  // Fixed dates, so the same invoice always produces the same document.
  doc.setCreationDate(created)
  doc.setModificationDate(created)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage(A4)
  return { doc, page, regular, bold, y: A4[1] - MARGIN }
}

function issuerLines(snapshot: InvoiceSnapshot): string[] {
  const i = snapshot.issuer
  return [
    i.abn ? `ABN ${formatAbn(i.abn)}` : null,
    i.addressLine,
    [i.suburb, i.state, i.postcode].filter(Boolean).join(' ') || null,
    i.phone,
    i.email,
  ].filter((v): v is string => !!v)
}

/** The header shared by invoices and receipts: logo and issuer on the left, document facts on the right. */
async function header(pen: Pen, snapshot: InvoiceSnapshot, logo: LogoSource, title: string, facts: Array<[string, string]>) {
  const top = pen.y
  const brand = hex(snapshot.issuer.brandColour)
  const logoHeight = await drawLogo(pen, logo, MARGIN, top, 210, 62)
  let y = top - (logoHeight > 0 ? logoHeight + 14 : 0)
  // With a logo the name sits small beneath it; without one the name is the masthead.
  text(pen, snapshot.issuer.name, MARGIN, y - (logoHeight > 0 ? 0 : 6), { size: logoHeight > 0 ? 11 : 17, bold: true, colour: logoHeight > 0 ? INK : brand })
  y -= logoHeight > 0 ? 14 : 24
  for (const line of issuerLines(snapshot)) {
    text(pen, line, MARGIN, y, { colour: MUTED, size: 9 })
    y -= 12
  }

  const right = A4[0] - MARGIN
  text(pen, title.toUpperCase(), right, top - 16, { size: 19, bold: true, colour: brand, align: 'right' })
  let fy = top - 40
  // Labels line up just left of the widest value, so a long date never runs into its label.
  const valueWidth = Math.max(...facts.map(([, value]) => pen.bold.widthOfTextAtSize(safe(pen.bold, value), 9.5)))
  for (const [label, value] of facts) {
    text(pen, label, right - valueWidth - 12, fy, { colour: MUTED, size: 9, align: 'right' })
    text(pen, value, right, fy, { bold: true, size: 9.5, align: 'right' })
    fy -= 14
  }
  pen.y = Math.min(y, fy) - 12
}

function billTo(pen: Pen, snapshot: InvoiceSnapshot, heading: string) {
  rule(pen, pen.y)
  let y = pen.y - 18
  text(pen, heading.toUpperCase(), MARGIN, y, { size: 8, bold: true, colour: MUTED })
  if (snapshot.property) text(pen, 'SITE ADDRESS', MARGIN + 262, y, { size: 8, bold: true, colour: MUTED })
  y -= 15
  text(pen, snapshot.customer.name, MARGIN, y, { bold: true, size: 10.5 })
  if (snapshot.property) text(pen, snapshot.property.addressLine, MARGIN + 262, y, { size: 10 })
  y -= 13
  const contact = [snapshot.customer.email, snapshot.customer.phone].filter((v): v is string => !!v)
  const site = snapshot.property ? [`${snapshot.property.suburb} ${snapshot.property.state} ${snapshot.property.postcode}`, snapshot.jobReference ? `Job ${snapshot.jobReference}` : null].filter((v): v is string => !!v) : []
  for (let i = 0; i < Math.max(contact.length, site.length); i++) {
    if (contact[i]) text(pen, contact[i], MARGIN, y, { colour: MUTED, size: 9 })
    if (site[i]) text(pen, site[i], MARGIN + 262, y, { colour: MUTED, size: 9 })
    y -= 12
  }
  pen.y = y - 8
}

const COLS = { description: MARGIN + 8, quantity: 352, unit: 422, gst: 462, amount: A4[0] - MARGIN - 8 }

function tableHead(pen: Pen, snapshot: InvoiceSnapshot) {
  const brand = hex(snapshot.issuer.brandColour)
  pen.page.drawRectangle({ x: MARGIN, y: pen.y - 20, width: A4[0] - MARGIN * 2, height: 20, color: brand })
  const y = pen.y - 14
  text(pen, 'Description', COLS.description, y, { size: 8.5, bold: true, colour: WHITE })
  text(pen, 'Qty', COLS.quantity, y, { size: 8.5, bold: true, colour: WHITE, align: 'right' })
  text(pen, 'Unit price', COLS.unit, y, { size: 8.5, bold: true, colour: WHITE, align: 'right' })
  if (snapshot.gstRegistered) text(pen, 'GST', COLS.gst, y, { size: 8.5, bold: true, colour: WHITE, align: 'right' })
  text(pen, 'Amount', COLS.amount, y, { size: 8.5, bold: true, colour: WHITE, align: 'right' })
  pen.y -= 20
}

export async function renderInvoicePdf(input: {
  snapshot: InvoiceSnapshot
  logo: LogoSource
  payments: PaymentLine[]
  issuedAt: Date
  voided: boolean
}): Promise<Uint8Array> {
  const { snapshot, payments } = input
  const pen = await start(`${snapshot.title} ${snapshot.number}`, snapshot.issuer.name, input.issuedAt)
  const currency = snapshot.currency

  await header(pen, snapshot, input.logo, snapshot.title, [
    ['Invoice number', snapshot.number],
    ['Invoice date', longDate(snapshot.issueDate)],
    ...(snapshot.dueDate ? ([['Due date', longDate(snapshot.dueDate)]] as Array<[string, string]>) : []),
  ])
  billTo(pen, snapshot, 'Bill to')
  tableHead(pen, snapshot)

  for (const [i, line] of snapshot.lines.entries()) {
    const wrapped = wrap(pen.regular, line.description, 9.5, COLS.quantity - 44 - COLS.description)
    const height = wrapped.length * 12 + 10
    if (pen.y - height < MARGIN + 40) {
      newPage(pen)
      tableHead(pen, snapshot)
    }
    if (i % 2 === 1) pen.page.drawRectangle({ x: MARGIN, y: pen.y - height, width: A4[0] - MARGIN * 2, height, color: rgb(0.97, 0.98, 0.99) })
    let y = pen.y - 15
    for (const part of wrapped) {
      text(pen, part, COLS.description, y)
      y -= 12
    }
    const first = pen.y - 15
    text(pen, formatQuantity(line.quantityX100), COLS.quantity, first, { align: 'right' })
    text(pen, money(line.unitPriceCents, currency), COLS.unit, first, { align: 'right' })
    if (snapshot.gstRegistered) text(pen, line.gstApplicable ? '10%' : 'Free', COLS.gst, first, { align: 'right', colour: MUTED, size: 8.5 })
    text(pen, money(line.amountCents, currency), COLS.amount, first, { align: 'right' })
    pen.y -= height
  }
  rule(pen, pen.y)

  // Totals, kept together on one page.
  const paid = payments.reduce((sum, p) => sum + p.amountCents, 0)
  const balance = Math.max(0, snapshot.totals.totalCents - paid)
  const rows = 3 + payments.length + 2
  if (pen.y - rows * 16 - 60 < MARGIN) newPage(pen)
  let y = pen.y - 20
  const labelX = 350
  const totalRow = (label: string, value: string, options: { bold?: boolean; size?: number; colour?: RGB } = {}) => {
    const size = options.size ?? 9.5
    const room = COLS.amount - (options.bold ? pen.bold : pen.regular).widthOfTextAtSize(value, size) - 10 - labelX
    label = wrap(options.bold ? pen.bold : pen.regular, label, size, room)[0] ?? label
    text(pen, label, labelX, y, { colour: options.bold ? INK : MUTED, bold: options.bold, size: options.size ?? 9.5 })
    text(pen, value, COLS.amount, y, { align: 'right', bold: options.bold, size: options.size ?? 9.5, colour: options.colour })
    y -= (options.size ?? 9.5) + 7
  }
  if (snapshot.gstRegistered) {
    totalRow('Subtotal (before GST)', money(snapshot.totals.subtotalExGstCents, currency))
    totalRow('GST (10%)', money(snapshot.totals.gstCents, currency))
  }
  rule(pen, y + 9, labelX, A4[0] - MARGIN)
  y -= 4
  totalRow(snapshot.gstRegistered ? 'Total including GST' : 'Total', money(snapshot.totals.totalCents, currency), { bold: true, size: 11.5 })
  for (const payment of payments) {
    totalRow(`Paid ${shortDate(payment.date)}, ${(PAYMENT_METHOD_LABELS[payment.method] ?? payment.method).toLowerCase()}`, `-${money(payment.amountCents, currency)}`, { size: 8.8 })
  }
  y -= payments.length > 0 ? 6 : 0
  const brand = hex(snapshot.issuer.brandColour)
  pen.page.drawRectangle({ x: labelX - 10, y: y - 12, width: A4[0] - MARGIN - labelX + 10, height: 28, color: balance === 0 ? rgb(0.9, 0.96, 0.92) : rgb(0.95, 0.97, 1) })
  text(pen, balance === 0 ? 'Paid in full' : 'Balance due', labelX, y - 2, { bold: true, size: 11 })
  text(pen, money(balance, currency), COLS.amount, y - 2, { align: 'right', bold: true, size: 13, colour: balance === 0 ? rgb(0.18, 0.49, 0.27) : brand })

  // GST wording, notes, terms and how to pay, down the left.
  let ly = pen.y - 20
  const leftWidth = labelX - MARGIN - 34
  const block = (heading: string | null, body: string, colour: RGB = INK) => {
    if (heading) {
      text(pen, heading.toUpperCase(), MARGIN, ly, { size: 8, bold: true, colour: MUTED })
      ly -= 13
    }
    for (const part of wrap(pen.regular, body, 9, leftWidth)) {
      text(pen, part, MARGIN, ly, { size: 9, colour })
      ly -= 12
    }
    ly -= 8
  }
  block(
    null,
    snapshot.gstRegistered
      ? snapshot.pricesIncludeGst
        ? `Prices include GST. The total price includes GST of ${money(snapshot.totals.gstCents, currency)}.`
        : 'Prices are shown before GST; GST is added to the total.'
      : 'No GST has been charged.',
    MUTED
  )
  block('Terms', snapshot.terms)
  if (snapshot.notes) block('Notes', snapshot.notes)
  if (snapshot.footer) block('How to pay', snapshot.footer)

  if (input.voided) {
    pen.page.drawText('VOID', { x: 150, y: 330, size: 150, font: pen.bold, color: rgb(0.75, 0.21, 0.17), opacity: 0.14, rotate: { type: 'degrees', angle: 32 } as never })
  }

  const pages = pen.doc.getPages()
  pages.forEach((page, i) => {
    page.drawText(safe(pen.regular, `${snapshot.issuer.name} · ${snapshot.title} ${snapshot.number} · Page ${i + 1} of ${pages.length}`), {
      x: MARGIN,
      y: 24,
      size: 7.5,
      font: pen.regular,
      color: MUTED,
    })
  })
  return pen.doc.save({ useObjectStreams: false })
}

export async function renderReceiptPdf(input: {
  snapshot: InvoiceSnapshot
  logo: LogoSource
  payment: PaymentLine
  balanceAfterCents: number
  receivedAt: Date
}): Promise<Uint8Array> {
  const { snapshot, payment } = input
  const number = receiptNumberLabel(payment.receiptNumber)
  const pen = await start(`Receipt ${number}`, snapshot.issuer.name, input.receivedAt)
  await header(pen, snapshot, input.logo, 'Receipt', [
    ['Receipt number', number],
    ['Date received', longDate(payment.date)],
    ['For invoice', snapshot.number],
  ])
  billTo(pen, snapshot, 'Received from')
  rule(pen, pen.y)

  let y = pen.y - 30
  text(pen, 'Amount received', MARGIN, y, { colour: MUTED, size: 10 })
  text(pen, money(payment.amountCents, snapshot.currency), A4[0] - MARGIN, y - 4, { bold: true, size: 22, align: 'right', colour: hex(snapshot.issuer.brandColour) })
  y -= 30
  const row = (label: string, value: string) => {
    text(pen, label, MARGIN, y, { colour: MUTED })
    text(pen, value, A4[0] - MARGIN, y, { align: 'right', bold: true })
    y -= 17
  }
  row('Paid by', PAYMENT_METHOD_LABELS[payment.method] ?? payment.method)
  if (payment.reference) row('Reference', payment.reference)
  row(`${snapshot.title} ${snapshot.number} total`, money(snapshot.totals.totalCents, snapshot.currency))
  if (snapshot.gstRegistered) row('Includes GST of', money(snapshot.totals.gstCents, snapshot.currency))
  rule(pen, y + 6)
  y -= 8
  row(input.balanceAfterCents === 0 ? 'Invoice paid in full' : 'Balance still owing', money(input.balanceAfterCents, snapshot.currency))
  y -= 14
  text(pen, 'Thank you.', MARGIN, y, { size: 11, bold: true })
  pen.page.drawText(safe(pen.regular, `${snapshot.issuer.name} · Receipt ${number}`), { x: MARGIN, y: 24, size: 7.5, font: pen.regular, color: MUTED })
  return pen.doc.save({ useObjectStreams: false })
}
