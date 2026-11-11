import 'server-only'

import { createHash, createHmac } from 'node:crypto'
import { InvoicePaymentMethod, InvoicePaymentStatus, InvoiceStatus, NotificationType, Prisma, TransactionStatus } from '@prisma/client'
import { audit } from '@/lib/audit'
import { loadBrand, logoSource, type Brand } from '@/lib/branding/brand'
import type { BusinessContext } from '@/lib/business/access'
import { isValidAbn } from '@/lib/business-details'
import { formatMoney } from '@/lib/money'
import { notify } from '@/lib/notifications'
import { notifyBusiness, notifyCustomer } from '@/lib/pricing/notify'
import { gstBreakdown, type QuoteLine } from '@/lib/pricing/engine'
import { prisma } from '@/lib/prisma'
import { addDays, localDateString, parseDateString, zonedToUtc } from '@/lib/timezone'
import { balanceCents, invoiceNumberLabel, invoiceTotals, lineAmountCents, type LineInput, type LineKindId } from './money'
import { renderInvoicePdf, renderReceiptPdf } from './pdf'
import { parseSnapshot, termsText, type InvoiceSnapshot, type PaymentLine } from './snapshot'

/**
 * Invoices from draft to paid.
 *
 * The rules that matter:
 *  - amounts are worked out here, on the server, from the stored lines;
 *  - issuing happens once: the invoice takes the business's next number
 *    and a frozen copy of everything printed on it, in one transaction,
 *    and pressing Issue again returns the same invoice;
 *  - a payment is recorded once per idempotency key, and a card payment
 *    only counts when Stripe's signed event says so;
 *  - sending is separate from issuing, so a failed email never loses or
 *    duplicates an invoice.
 */

type Tx = Prisma.TransactionClient

export class InvoiceError extends Error {}

export const INVOICE_INCLUDE = {
  lines: { orderBy: { sortOrder: 'asc' } },
  customer: true,
  property: true,
  job: { select: { id: true, reference: true, title: true } },
  payments: { orderBy: { receivedAt: 'asc' } },
  deliveries: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.InvoiceInclude

export type InvoiceFull = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>

export async function loadInvoice(businessId: string, id: string): Promise<InvoiceFull | null> {
  return prisma.invoice.findFirst({ where: { id, businessId }, include: INVOICE_INCLUDE })
}

/** The next number in a business's own sequence. The row lock makes concurrent callers queue. */
async function nextNumber(tx: Tx, businessId: string, name: 'invoice' | 'receipt'): Promise<number> {
  await tx.$executeRaw`INSERT INTO "BusinessCounter" ("businessId", "name", "next") VALUES (${businessId}, ${name}, 1) ON CONFLICT DO NOTHING`
  const rows = await tx.$queryRaw<Array<{ issued: number }>>`
    UPDATE "BusinessCounter" SET "next" = "next" + 1 WHERE "businessId" = ${businessId} AND "name" = ${name} RETURNING "next" - 1 AS issued`
  return Number(rows[0].issued)
}

const QUOTE_KIND: Record<QuoteLine['kind'], LineKindId> = { base: 'DOOR', installation: 'INSTALLATION', motor: 'MOTOR', accessory: 'PART', travel: 'OTHER' }

/**
 * The lines a job already agreed to, so nobody types them again: the
 * itemised price the business set after a measure, or the option the
 * customer accepted on an automated quote, or failing both the agreed
 * total as one line.
 */
export async function linesFromJob(job: {
  title: string | null
  agreedPriceCents: number | null
  priceLines: Prisma.JsonValue | null
  automatedQuote: { acceptedOptionId: string | null; options: Array<{ id: string; lines: Prisma.JsonValue | null; totalIncGstCents: number; productBrand: string | null }> } | null
}): Promise<LineInput[]> {
  if (Array.isArray(job.priceLines) && job.priceLines.length > 0) {
    return (job.priceLines as unknown as LineInput[]).map((l) => ({
      kind: l.kind,
      description: String(l.description),
      quantityX100: Number(l.quantityX100),
      unitPriceCents: Number(l.unitPriceCents),
      gstApplicable: l.gstApplicable !== false,
    }))
  }
  const option = job.automatedQuote?.options.find((o) => o.id === job.automatedQuote?.acceptedOptionId)
  if (option && Array.isArray(option.lines)) {
    const lines = (option.lines as unknown as QuoteLine[]).map((line) => ({
      kind: QUOTE_KIND[line.kind] ?? 'OTHER',
      description: line.kind === 'base' && option.productBrand ? `${line.label} (${option.productBrand})` : line.label,
      quantityX100: 100,
      // Invoices carry GST-inclusive prices; a quote line priced before GST is grossed up here.
      unitPriceCents: gstBreakdown(line.amountCents, line.gst).totalIncGstCents,
      gstApplicable: true,
    }))
    // Rounding line by line can leave a cent's difference from the quoted total; the first line absorbs it.
    const drift = option.totalIncGstCents - lines.reduce((sum, l) => sum + l.unitPriceCents, 0)
    if (lines.length > 0 && drift !== 0 && Math.abs(drift) <= lines.length) lines[0].unitPriceCents += drift
    if (lines.length > 0) return lines
  }
  if (job.agreedPriceCents)
    return [{ kind: 'OTHER', description: job.title ?? 'Supply and install, as agreed', quantityX100: 100, unitPriceCents: job.agreedPriceCents, gstApplicable: true }]
  return []
}

/**
 * Step 1: a draft for a job (with its customer, site and agreed items
 * pulled in) or for a customer on their own. Asking twice for the same
 * job returns the same draft.
 */
export async function createDraft(
  context: BusinessContext,
  actorId: string,
  source: { jobId: string } | { customerId: string; propertyId: string | null }
): Promise<string> {
  const brand = await loadBrand(context)
  if ('jobId' in source) {
    const job = await prisma.job.findFirst({
      where: { id: source.jobId, businessId: context.businessId },
      include: { automatedQuote: { select: { acceptedOptionId: true, options: { select: { id: true, lines: true, totalIncGstCents: true, productBrand: true } } } } },
    })
    if (!job) throw new InvoiceError('That job isn’t one of yours.')
    if (!job.businessCustomerId) throw new InvoiceError('This job has no customer record yet. Open the job once to link it, then try again.')
    const existing = await prisma.invoice.findFirst({ where: { businessId: context.businessId, jobId: job.id, status: InvoiceStatus.DRAFT }, select: { id: true } })
    if (existing) return existing.id
    const lines = await linesFromJob(job)
    const invoice = await prisma.invoice.create({
      data: {
        businessId: context.businessId,
        customerId: job.businessCustomerId,
        propertyId: job.propertyId,
        jobId: job.id,
        pricesIncludeGst: true,
        gstRegistered: brand.gstRegistered,
        createdById: actorId,
        lines: { create: lines.map((line, sortOrder) => ({ ...line, stockItemId: null, sortOrder })) },
      },
    })
    return invoice.id
  }
  const customer = await prisma.businessCustomer.findFirst({ where: { id: source.customerId, businessId: context.businessId }, select: { id: true } })
  if (!customer) throw new InvoiceError('That customer isn’t one of yours.')
  if (source.propertyId) {
    const property = await prisma.property.findFirst({ where: { id: source.propertyId, businessId: context.businessId, customerId: customer.id }, select: { id: true } })
    if (!property) throw new InvoiceError('That address doesn’t belong to this customer.')
  }
  const invoice = await prisma.invoice.create({
    data: { businessId: context.businessId, customerId: customer.id, propertyId: source.propertyId, pricesIncludeGst: true, gstRegistered: brand.gstRegistered, createdById: actorId },
  })
  return invoice.id
}

/** Step 2: replaces a draft's lines and terms. Only a draft can be edited. */
export async function saveDraft(
  context: BusinessContext,
  id: string,
  input: { lines: LineInput[]; pricesIncludeGst: boolean; dueDate: string | null; notes: string | null }
): Promise<void> {
  if (input.dueDate && !parseDateString(input.dueDate)) throw new InvoiceError('Pick a valid due date.')
  const stockIds = [...new Set(input.lines.map((l) => l.stockItemId).filter((v): v is string => !!v))]
  if (stockIds.length > 0) {
    const owned = await prisma.stockItem.count({ where: { id: { in: stockIds }, businessId: context.businessId } })
    if (owned !== stockIds.length) throw new InvoiceError('One of the stock items isn’t yours.')
  }
  const due = input.dueDate ? zonedToUtc({ ...parseDateString(input.dueDate)!, hour: 23, minute: 59 }, context.timezone) : null
  await prisma.$transaction(async (tx) => {
    const draft = await tx.invoice.findFirst({ where: { id, businessId: context.businessId }, select: { status: true } })
    if (!draft) throw new InvoiceError('Invoice not found.')
    if (draft.status !== InvoiceStatus.DRAFT) throw new InvoiceError('This invoice has been issued and can’t be edited. Void it and raise a new one if it’s wrong.')
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } })
    await tx.invoiceLine.createMany({
      data: input.lines.map((line, sortOrder) => ({
        invoiceId: id,
        sortOrder,
        kind: line.kind,
        description: line.description,
        quantityX100: line.quantityX100,
        unitPriceCents: line.unitPriceCents,
        gstApplicable: line.gstApplicable,
        stockItemId: line.stockItemId ?? null,
      })),
    })
    await tx.invoice.update({
      where: { id },
      data: { pricesIncludeGst: input.pricesIncludeGst, dueDate: due && due.ok ? due.utc : null, notes: input.notes?.trim().slice(0, 2000) || null },
    })
  })
}

/** What has already been paid on a job through Doorlink (a deposit, or the lot). */
export async function jobPaidCents(jobId: string | null): Promise<number> {
  if (!jobId) return 0
  const paid = await prisma.transaction.findMany({
    where: { jobId, status: { in: [TransactionStatus.PAID, TransactionStatus.PARTIALLY_REFUNDED] } },
    select: { grossCents: true, refundedCents: true },
  })
  return paid.reduce((sum, t) => sum + t.grossCents - t.refundedCents, 0)
}

/** The document as it would be (or was) issued. For a draft this is the preview; nothing is stored. */
export function buildSnapshot(input: {
  brand: Brand
  timezone: string
  number: string
  issueDate: string
  dueDate: string | null
  invoice: Pick<InvoiceFull, 'lines' | 'customer' | 'property' | 'job' | 'pricesIncludeGst' | 'notes' | 'currency'>
}): InvoiceSnapshot {
  const { brand, invoice } = input
  // A tax invoice needs an ABN. Without one the business charges no GST here, whatever its setting.
  const gstRegistered = brand.gstRegistered && !!brand.abn && isValidAbn(brand.abn)
  const lines = invoice.lines.map((line) => ({
    kind: line.kind as LineKindId,
    description: line.description,
    quantityX100: line.quantityX100,
    unitPriceCents: line.unitPriceCents,
    amountCents: lineAmountCents(line),
    gstApplicable: gstRegistered && line.gstApplicable,
  }))
  return {
    version: 1,
    number: input.number,
    title: gstRegistered ? 'Tax invoice' : 'Invoice',
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    issuer: {
      name: brand.name,
      abn: brand.abn,
      addressLine: brand.addressLine,
      suburb: brand.suburb,
      state: brand.state,
      postcode: brand.postcode,
      phone: brand.phone,
      email: brand.email,
      brandColour: brand.brandColour,
    },
    customer: { name: invoice.customer.name, email: invoice.customer.email, phone: invoice.customer.phone },
    property: invoice.property
      ? { addressLine: invoice.property.addressLine, suburb: invoice.property.suburb, state: invoice.property.state, postcode: invoice.property.postcode }
      : null,
    jobReference: invoice.job?.reference ?? null,
    lines,
    gstRegistered,
    pricesIncludeGst: invoice.pricesIncludeGst,
    totals: invoiceTotals(invoice.lines, { gstRegistered, pricesIncludeGst: invoice.pricesIncludeGst }),
    currency: invoice.currency,
    notes: invoice.notes,
    terms: termsText(brand.invoiceTermsDays),
    footer: brand.invoiceFooter,
  }
}

/** The preview for a draft: today's date, the business's terms, no number yet. */
export async function previewSnapshot(context: BusinessContext, invoice: InvoiceFull): Promise<InvoiceSnapshot> {
  const brand = await loadBrand(context)
  const today = localDateString(new Date(), context.timezone)
  return buildSnapshot({
    brand,
    timezone: context.timezone,
    number: 'DRAFT',
    issueDate: today,
    dueDate: invoice.dueDate ? localDateString(invoice.dueDate, context.timezone) : addDays(today, brand.invoiceTermsDays),
    invoice,
  })
}

async function recomputePaid(tx: Tx, invoiceId: string): Promise<number> {
  const sum = await tx.invoicePayment.aggregate({ where: { invoiceId, status: InvoicePaymentStatus.CONFIRMED }, _sum: { amountCents: true } })
  const paidCents = sum._sum.amountCents ?? 0
  await tx.invoice.update({ where: { id: invoiceId }, data: { paidCents } })
  return paidCents
}

/**
 * Brings money already taken on the job through Doorlink (a deposit paid
 * by card) onto the invoice as payments. Each job payment is linked once.
 */
export async function syncJobPayments(tx: Tx, invoice: { id: string; businessId: string; jobId: string | null }): Promise<void> {
  if (!invoice.jobId) return
  const paid = await tx.transaction.findMany({
    where: { jobId: invoice.jobId, status: { in: [TransactionStatus.PAID, TransactionStatus.PARTIALLY_REFUNDED] } },
  })
  for (const transaction of paid) {
    const amount = transaction.grossCents - transaction.refundedCents
    const linked = await tx.invoicePayment.findUnique({ where: { transactionId: transaction.id } })
    if (linked) {
      if (linked.amountCents !== amount && amount > 0) await tx.invoicePayment.update({ where: { id: linked.id }, data: { amountCents: amount } })
      continue
    }
    if (amount <= 0) continue
    await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amountCents: amount,
        method: InvoicePaymentMethod.STRIPE,
        status: InvoicePaymentStatus.CONFIRMED,
        receivedAt: transaction.paidAt ?? transaction.updatedAt,
        reference: transaction.reference,
        note: transaction.kind === 'DEPOSIT' ? 'Deposit paid through Doorlink' : 'Paid through Doorlink',
        transactionId: transaction.id,
        provider: 'stripe',
        receiptNumber: await nextNumber(tx, invoice.businessId, 'receipt'),
      },
    })
  }
  await recomputePaid(tx, invoice.id)
}

/**
 * Step 3: issue. Once. The number, the totals and the frozen copy are all
 * written in the same transaction as the status change, and a second call
 * (a double tap, a retry after a timeout) finds the invoice already
 * issued and returns it unchanged.
 */
export async function issueInvoice(context: BusinessContext, actorId: string, id: string): Promise<{ id: string; number: number; alreadyIssued: boolean }> {
  const brand = await loadBrand(context)
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id, businessId: context.businessId }, include: INVOICE_INCLUDE })
    if (!invoice) throw new InvoiceError('Invoice not found.')
    if (invoice.status === InvoiceStatus.ISSUED && invoice.number !== null) return { id, number: invoice.number, alreadyIssued: true, invoice }
    if (invoice.status !== InvoiceStatus.DRAFT) throw new InvoiceError('This invoice has been voided.')
    if (invoice.lines.length === 0) throw new InvoiceError('Add at least one item before issuing.')
    if (brand.gstRegistered && !(brand.abn && isValidAbn(brand.abn)))
      throw new InvoiceError('You’re marked as registered for GST but have no valid ABN on file. Add it in Settings, then issue the invoice.')

    const today = localDateString(new Date(), context.timezone)
    const dueDate = invoice.dueDate ? localDateString(invoice.dueDate, context.timezone) : addDays(today, brand.invoiceTermsDays)
    const due = zonedToUtc({ ...parseDateString(dueDate)!, hour: 23, minute: 59 }, context.timezone)
    const number = await nextNumber(tx, context.businessId, 'invoice')
    const snapshot = buildSnapshot({ brand, timezone: context.timezone, number: invoiceNumberLabel(number), issueDate: today, dueDate, invoice })
    if (snapshot.totals.totalCents < 0) throw new InvoiceError('The total can’t be negative.')

    const issued = await tx.invoice.updateMany({
      where: { id, status: InvoiceStatus.DRAFT },
      data: {
        status: InvoiceStatus.ISSUED,
        number,
        issuedAt: new Date(),
        issueDate: new Date(),
        dueDate: due.ok ? due.utc : null,
        gstRegistered: snapshot.gstRegistered,
        subtotalExGstCents: snapshot.totals.subtotalExGstCents,
        gstCents: snapshot.totals.gstCents,
        totalCents: snapshot.totals.totalCents,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        logoVersionId: brand.logoVersionId,
      },
    })
    // Lost a race with another Issue press: that one's number stands, this transaction is undone.
    if (issued.count === 0) throw new InvoiceError('__raced__')

    // Parts used come off the shelf, once per line.
    for (const line of invoice.lines) {
      if (!line.stockItemId) continue
      await tx.stockMovement.create({
        data: { itemId: line.stockItemId, deltaX100: -line.quantityX100, reason: 'INVOICED', invoiceLineId: line.id, jobId: invoice.jobId, createdById: actorId, note: invoiceNumberLabel(number) },
      })
      await tx.stockItem.update({ where: { id: line.stockItemId }, data: { onHandX100: { decrement: line.quantityX100 } } })
    }
    await syncJobPayments(tx, { id, businessId: context.businessId, jobId: invoice.jobId })
    await audit({ actorId, action: 'invoice.issued', entityType: 'Invoice', entityId: id, metadata: { number, totalCents: snapshot.totals.totalCents } }, tx)
    return { id, number, alreadyIssued: false, invoice }
  }).catch(async (error) => {
    if (error instanceof InvoiceError && error.message === '__raced__') {
      const winner = await prisma.invoice.findFirst({ where: { id, businessId: context.businessId }, include: INVOICE_INCLUDE })
      if (winner?.number != null) return { id, number: winner.number, alreadyIssued: true, invoice: winner }
    }
    throw error
  })

  if (!result.alreadyIssued) {
    const issued = await prisma.invoice.findUnique({ where: { id }, select: { totalCents: true, paidCents: true, dueDate: true, customer: { select: { userId: true } } } })
    if (issued?.customer.userId)
      await notifyCustomer(
        issued.customer.userId,
        {
          type: NotificationType.INVOICE,
          title: `Invoice ${invoiceNumberLabel(result.number)} from ${brand.name}`,
          body: `${formatMoney(balanceCents(issued))} is due${issued.dueDate ? ` by ${new Intl.DateTimeFormat('en-AU', { timeZone: context.timezone, day: 'numeric', month: 'long' }).format(issued.dueDate)}` : ''}.`,
          href: `/invoices/${id}`,
        },
        { email: false }
      )
    await lowStockAlerts(context)
  }
  return { id: result.id, number: result.number, alreadyIssued: result.alreadyIssued }
}

/** Tells the owner once when an item falls to its reorder level; clears when it is restocked. */
export async function lowStockAlerts(context: Pick<BusinessContext, 'businessId' | 'key'>): Promise<number> {
  const items = await prisma.stockItem.findMany({ where: { businessId: context.businessId, archivedAt: null, reorderX100: { gt: 0 } } })
  let alerted = 0
  for (const item of items) {
    const low = item.onHandX100 <= item.reorderX100
    if (low && !item.lowAlertedAt) {
      const claimed = await prisma.stockItem.updateMany({ where: { id: item.id, lowAlertedAt: null }, data: { lowAlertedAt: new Date() } })
      if (claimed.count === 0) continue
      alerted++
      await notifyBusiness(
        context.key,
        {
          type: NotificationType.STOCK_ALERT,
          title: `Low stock: ${item.name}`,
          body: `${(item.onHandX100 / 100).toString()} ${item.unit} left (reorder at ${(item.reorderX100 / 100).toString()}).`,
          href: '/business/stock',
        },
        { email: false }
      )
    } else if (!low && item.lowAlertedAt) {
      await prisma.stockItem.update({ where: { id: item.id }, data: { lowAlertedAt: null } })
    }
  }
  return alerted
}

export interface ManualPaymentInput {
  amountCents: number
  method: InvoicePaymentMethod
  /** Local date received, "YYYY-MM-DD". */
  date: string
  reference: string | null
  note: string | null
  idempotencyKey: string
}

/**
 * A payment the business took itself (cash, a bank transfer, a card on
 * site). Recorded once per form: the same key again returns the first.
 */
export async function recordPayment(context: BusinessContext, actorId: string, invoiceId: string, input: ManualPaymentInput): Promise<{ paymentId: string; duplicate: boolean }> {
  if (input.method === InvoicePaymentMethod.STRIPE) throw new InvoiceError('Card payments online are confirmed by Stripe, not entered by hand.')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new InvoiceError('Enter the amount received.')
  const date = parseDateString(input.date)
  if (!date) throw new InvoiceError('Pick the date it was received.')
  const received = zonedToUtc({ ...date, hour: 12, minute: 0 }, context.timezone)
  if (!received.ok || received.utc.getTime() > Date.now() + 86_400_000) throw new InvoiceError('The date received can’t be in the future.')
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.idempotencyKey)) throw new InvoiceError('Reload the page and try again.')

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoicePayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
      if (existing) {
        if (existing.invoiceId !== invoiceId) throw new InvoiceError('Reload the page and try again.')
        return { paymentId: existing.id, duplicate: true, paidCents: 0, invoice: null }
      }
      // Lock the invoice row so two people recording at once are added up one after the other.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "businessId" = ${context.businessId} FOR UPDATE`
      if (locked.length === 0) throw new InvoiceError('Invoice not found.')
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: { select: { userId: true } } } })
      if (invoice.status !== InvoiceStatus.ISSUED) throw new InvoiceError(invoice.status === InvoiceStatus.DRAFT ? 'Issue the invoice before recording a payment.' : 'This invoice is void.')
      const owing = balanceCents(invoice)
      if (owing === 0) throw new InvoiceError('This invoice is already paid in full.')
      if (input.amountCents > owing) throw new InvoiceError(`That’s more than the ${formatMoney(owing)} still owing.`)
      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId,
          amountCents: input.amountCents,
          method: input.method,
          status: InvoicePaymentStatus.CONFIRMED,
          receivedAt: received.utc,
          reference: input.reference?.trim().slice(0, 80) || null,
          note: input.note?.trim().slice(0, 300) || null,
          recordedById: actorId,
          idempotencyKey: input.idempotencyKey,
          receiptNumber: await nextNumber(tx, context.businessId, 'receipt'),
        },
      })
      const paidCents = await recomputePaid(tx, invoiceId)
      await audit({ actorId, action: 'invoice.payment.recorded', entityType: 'Invoice', entityId: invoiceId, metadata: { paymentId: payment.id, amountCents: input.amountCents, method: input.method } }, tx)
      return { paymentId: payment.id, duplicate: false, paidCents, invoice }
    })
    if (!result.duplicate && result.invoice?.customer.userId)
      await notify({
        userId: result.invoice.customer.userId,
        type: NotificationType.PAYMENT_STATUS,
        title: `Payment received: ${formatMoney(input.amountCents)}`,
        body: `${context.name} recorded your payment on invoice ${invoiceNumberLabel(result.invoice.number)}. Your receipt is ready.`,
        href: `/invoices/${invoiceId}`,
      })
    return { paymentId: result.paymentId, duplicate: result.duplicate }
  } catch (error) {
    // Two submissions of the same form at the same moment: the second finds the first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const first = await prisma.invoicePayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
      if (first && first.invoiceId === invoiceId) return { paymentId: first.id, duplicate: true }
    }
    throw error
  }
}

/** Undoes a payment entered by mistake. The row stays, marked reversed, with who and why. */
export async function reversePayment(context: BusinessContext, actorId: string, paymentId: string, reason: string): Promise<void> {
  const why = reason.trim().slice(0, 300)
  if (!why) throw new InvoiceError('Say why the payment is being reversed.')
  await prisma.$transaction(async (tx) => {
    const payment = await tx.invoicePayment.findFirst({ where: { id: paymentId, invoice: { businessId: context.businessId } } })
    if (!payment) throw new InvoiceError('Payment not found.')
    if (payment.method === InvoicePaymentMethod.STRIPE) throw new InvoiceError('A card payment is refunded through Stripe, not reversed here.')
    const updated = await tx.invoicePayment.updateMany({ where: { id: paymentId, status: InvoicePaymentStatus.CONFIRMED }, data: { status: InvoicePaymentStatus.REVERSED, failureReason: why } })
    if (updated.count === 0) throw new InvoiceError('That payment has already been reversed.')
    await recomputePaid(tx, payment.invoiceId)
    await audit({ actorId, action: 'invoice.payment.reversed', entityType: 'Invoice', entityId: payment.invoiceId, metadata: { paymentId, amountCents: payment.amountCents, reason: why } }, tx)
  })
}

/** Voids an issued invoice nothing has been paid on. Its number is never reused; stock it took goes back. */
export async function voidInvoice(context: BusinessContext, actorId: string, id: string, reason: string): Promise<void> {
  const why = reason.trim().slice(0, 300)
  if (!why) throw new InvoiceError('Say why the invoice is being voided.')
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id, businessId: context.businessId }, include: { lines: { include: { stockMovement: true } } } })
    if (!invoice) throw new InvoiceError('Invoice not found.')
    if (invoice.status === InvoiceStatus.DRAFT) {
      await tx.invoice.delete({ where: { id } })
      return
    }
    if (invoice.paidCents > 0) throw new InvoiceError('Payments have been recorded on this invoice. Reverse or refund them first.')
    const updated = await tx.invoice.updateMany({ where: { id, status: InvoiceStatus.ISSUED }, data: { status: InvoiceStatus.VOID, voidedAt: new Date(), voidReason: why, shareTokenHash: null } })
    if (updated.count === 0) throw new InvoiceError('This invoice is already void.')
    for (const line of invoice.lines) {
      if (!line.stockItemId || !line.stockMovement) continue
      await tx.stockMovement.create({ data: { itemId: line.stockItemId, deltaX100: line.quantityX100, reason: 'VOIDED', createdById: actorId, note: invoiceNumberLabel(invoice.number) } })
      await tx.stockItem.update({ where: { id: line.stockItemId }, data: { onHandX100: { increment: line.quantityX100 } } })
    }
    await audit({ actorId, action: 'invoice.voided', entityType: 'Invoice', entityId: id, metadata: { number: invoice.number, reason: why } }, tx)
  })
}

// ---------------------------------------------------------------- sharing

const SHARE_DAYS = 60

function shareSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) throw new InvoiceError('Share links need AUTH_SECRET to be set on the server.')
  return secret
}

/** The token for an invoice's current link. Derived, so it can be shown again without being stored. */
function tokenFor(invoiceId: string, expiresAt: Date): string {
  return createHmac('sha256', shareSecret()).update(`invoice-share:${invoiceId}:${expiresAt.toISOString()}`).digest('base64url')
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * The link a customer can open without signing in. Only a hash of the
 * token is stored. `rotate` makes a new link and kills the old one.
 */
export async function shareLink(context: BusinessContext, id: string, options: { rotate?: boolean } = {}): Promise<{ path: string; expiresAt: Date }> {
  const invoice = await prisma.invoice.findFirst({ where: { id, businessId: context.businessId }, select: { status: true, shareTokenHash: true, shareTokenExpiresAt: true } })
  if (!invoice || invoice.status !== InvoiceStatus.ISSUED) throw new InvoiceError('Only an issued invoice can be shared.')
  const live = invoice.shareTokenHash && invoice.shareTokenExpiresAt && invoice.shareTokenExpiresAt.getTime() > Date.now() + 86_400_000
  if (live && !options.rotate) {
    const token = tokenFor(id, invoice.shareTokenExpiresAt!)
    if (hashToken(token) === invoice.shareTokenHash) return { path: `/i/${token}`, expiresAt: invoice.shareTokenExpiresAt! }
  }
  const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + SHARE_DAYS * 86_400_000)
  const token = tokenFor(id, expiresAt)
  await prisma.invoice.update({ where: { id }, data: { shareTokenHash: hashToken(token), shareTokenExpiresAt: expiresAt } })
  return { path: `/i/${token}`, expiresAt }
}

export async function revokeShareLink(context: BusinessContext, actorId: string, id: string): Promise<void> {
  await prisma.invoice.updateMany({ where: { id, businessId: context.businessId }, data: { shareTokenHash: null, shareTokenExpiresAt: null } })
  await audit({ actorId, action: 'invoice.share.revoked', entityType: 'Invoice', entityId: id })
}

/** The invoice a share token opens, or null: unknown, expired, revoked and void all look the same. */
export async function invoiceByShareToken(token: string): Promise<InvoiceFull | null> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null
  const invoice = await prisma.invoice.findUnique({ where: { shareTokenHash: hashToken(token) }, include: INVOICE_INCLUDE })
  if (!invoice || invoice.status !== InvoiceStatus.ISSUED) return null
  if (!invoice.shareTokenExpiresAt || invoice.shareTokenExpiresAt.getTime() < Date.now()) return null
  return invoice
}

// ------------------------------------------------------------- documents

export function paymentLines(invoice: Pick<InvoiceFull, 'payments'>, timezone: string): PaymentLine[] {
  return invoice.payments
    .filter((p) => p.status === InvoicePaymentStatus.CONFIRMED)
    .map((p) => ({ receiptNumber: p.receiptNumber, amountCents: p.amountCents, method: p.method, date: localDateString(p.receivedAt, timezone), reference: p.reference }))
}

async function timezoneOf(businessId: string): Promise<string> {
  return (await prisma.businessProfile.findUnique({ where: { id: businessId }, select: { timezone: true } }))?.timezone ?? 'Australia/Sydney'
}

/** The PDF of an issued invoice, from its frozen copy and the payments confirmed so far. */
export async function invoicePdf(invoice: InvoiceFull): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const snapshot = parseSnapshot(invoice.snapshot)
  if (!snapshot || !invoice.issuedAt) return null
  const timezone = await timezoneOf(invoice.businessId)
  const bytes = await renderInvoicePdf({
    snapshot,
    logo: await logoSource(invoice.logoVersionId),
    payments: paymentLines(invoice, timezone),
    issuedAt: invoice.issuedAt,
    voided: invoice.status === InvoiceStatus.VOID,
  })
  return { bytes, filename: `${snapshot.number}.pdf` }
}

export async function receiptPdf(invoice: InvoiceFull, paymentId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const snapshot = parseSnapshot(invoice.snapshot)
  const payment = invoice.payments.find((p) => p.id === paymentId && p.status === InvoicePaymentStatus.CONFIRMED)
  if (!snapshot || !payment) return null
  const timezone = await timezoneOf(invoice.businessId)
  // The balance after this payment: the total less everything confirmed up to and including it.
  const upTo = invoice.payments
    .filter((p) => p.status === InvoicePaymentStatus.CONFIRMED && (p.receivedAt < payment.receivedAt || (p.receivedAt.getTime() === payment.receivedAt.getTime() && (p.receiptNumber ?? 0) <= (payment.receiptNumber ?? 0))))
    .reduce((sum, p) => sum + p.amountCents, 0)
  const bytes = await renderReceiptPdf({
    snapshot,
    logo: await logoSource(invoice.logoVersionId),
    payment: { receiptNumber: payment.receiptNumber, amountCents: payment.amountCents, method: payment.method, date: localDateString(payment.receivedAt, timezone), reference: payment.reference },
    balanceAfterCents: Math.max(0, invoice.totalCents - upTo),
    receivedAt: payment.receivedAt,
  })
  return { bytes, filename: `Receipt-${String(payment.receiptNumber ?? 0).padStart(4, '0')}.pdf` }
}
