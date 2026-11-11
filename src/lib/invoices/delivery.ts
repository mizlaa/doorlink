import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { DeliveryStatus, InvoicePaymentMethod, InvoicePaymentStatus, InvoiceStatus, NotificationType, Prisma } from '@prisma/client'
import { audit } from '@/lib/audit'
import type { BusinessContext } from '@/lib/business/access'
import { canTakeOnlinePayment } from '@/lib/business/profile'
import { sendEmailDetailed } from '@/lib/email'
import { formatMoney } from '@/lib/money'
import { notify } from '@/lib/notifications'
import { connectConfigured, createInvoiceCheckout } from '@/lib/payments/connect'
import { notifyBusiness } from '@/lib/pricing/notify'
import { decodeBusinessKey } from '@/lib/pricing/business'
import { prisma } from '@/lib/prisma'
import { balanceCents, invoiceNumberLabel } from './money'
import { InvoiceError, invoicePdf, loadInvoice, shareLink } from './service'
import { longDate, parseSnapshot } from './snapshot'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Sending an invoice by email.
 *
 * Every attempt is a row: queued, then sent when the provider accepts it
 * (with the provider's id), or failed with the reason. A failed send
 * leaves the invoice exactly as it was; trying again is another attempt
 * on the same invoice. "Delivered" is only ever set by the provider's
 * signed webhook.
 */
export async function sendInvoice(context: BusinessContext, actorId: string, invoiceId: string, to: string): Promise<{ ok: boolean; deliveryId: string; error?: string }> {
  const recipient = to.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient) || recipient.length > 200) throw new InvoiceError('Enter the customer’s email address.')
  const invoice = await loadInvoice(context.businessId, invoiceId)
  if (!invoice) throw new InvoiceError('Invoice not found.')
  if (invoice.status !== InvoiceStatus.ISSUED) throw new InvoiceError('Issue the invoice before sending it.')
  const snapshot = parseSnapshot(invoice.snapshot)
  const pdf = await invoicePdf(invoice)
  if (!snapshot || !pdf) throw new InvoiceError('This invoice has no issued copy to send.')

  const delivery = await prisma.invoiceDelivery.create({ data: { invoiceId, recipient, status: DeliveryStatus.QUEUED, createdById: actorId } })
  const link = await shareLink(context, invoiceId)
  const owing = balanceCents(invoice)
  const lines = [
    `Hi ${snapshot.customer.name.split(' ')[0]},`,
    '',
    `Please find attached ${snapshot.title.toLowerCase()} ${snapshot.number} from ${snapshot.issuer.name}.`,
    '',
    `Total: ${formatMoney(snapshot.totals.totalCents, snapshot.currency)}`,
    owing === 0 ? 'This invoice is paid in full. Thank you.' : `Balance due: ${formatMoney(owing, snapshot.currency)}${snapshot.dueDate ? ` by ${longDate(snapshot.dueDate)}` : ''}`,
    '',
    `View it online: ${new URL(link.path, SITE_URL).toString()}`,
    ...(snapshot.footer ? ['', snapshot.footer] : []),
    '',
    snapshot.issuer.name,
    ...[snapshot.issuer.phone, snapshot.issuer.email].filter((v): v is string => !!v),
  ]
  const result = await sendEmailDetailed({
    to: recipient,
    subject: `${snapshot.title} ${snapshot.number} from ${snapshot.issuer.name}`,
    text: lines.join('\n'),
    attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.bytes).toString('base64') }],
  })
  if (result.ok) {
    await prisma.invoiceDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.SENT, providerId: result.id } })
    // The customer's email is kept for next time when the record had none.
    if (!invoice.customer.email) await prisma.businessCustomer.update({ where: { id: invoice.customerId }, data: { email: recipient } })
    return { ok: true, deliveryId: delivery.id }
  }
  await prisma.invoiceDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.FAILED, error: result.error } })
  return { ok: false, deliveryId: delivery.id, error: result.error }
}

/**
 * Checks a Resend (Svix) webhook signature: HMAC-SHA256 over
 * "id.timestamp.body" with the endpoint's secret, within five minutes.
 */
export function verifyResendWebhook(headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, secret: string): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false
  const sent = Number(headers.timestamp)
  if (!Number.isFinite(sent) || Math.abs(Date.now() / 1000 - sent) > 300) return false
  let key: Buffer
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  } catch {
    return false
  }
  const expected = createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${body}`).digest()
  return headers.signature.split(' ').some((part) => {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) return false
    const given = Buffer.from(value, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

/** Applies a verified delivery event to the attempt it belongs to. Repeats change nothing. */
export async function applyEmailEvent(event: { id: string; type: string; emailId: string | null; reason?: string | null }): Promise<'applied' | 'duplicate' | 'ignored'> {
  if (!event.emailId) return 'ignored'
  try {
    await prisma.webhookEvent.create({ data: { provider: 'resend', externalId: event.id, payload: { type: event.type, emailId: event.emailId }, processedAt: new Date() } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'duplicate'
    throw error
  }
  const delivery = await prisma.invoiceDelivery.findUnique({ where: { providerId: event.emailId }, include: { invoice: { select: { id: true, number: true, business: { select: { businessKey: true } } } } } })
  if (!delivery) return 'ignored'
  if (event.type === 'email.delivered') {
    await prisma.invoiceDelivery.updateMany({ where: { id: delivery.id, status: { in: [DeliveryStatus.SENT, DeliveryStatus.QUEUED] } }, data: { status: DeliveryStatus.DELIVERED } })
    return 'applied'
  }
  if (event.type === 'email.bounced' || event.type === 'email.complained' || event.type === 'email.delivery_delayed') {
    if (event.type === 'email.delivery_delayed') return 'ignored'
    await prisma.invoiceDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.FAILED, error: event.reason?.slice(0, 300) || (event.type === 'email.bounced' ? 'The email bounced.' : 'The recipient marked it as spam.') } })
    const key = decodeBusinessKey(delivery.invoice.business.businessKey)
    if (key)
      await notifyBusiness(
        key,
        { type: NotificationType.INVOICE, title: `Invoice ${invoiceNumberLabel(delivery.invoice.number)} didn’t reach ${delivery.recipient}`, body: 'The email bounced. Check the address and send it again.', href: `/business/invoices/${delivery.invoice.id}` },
        { email: false }
      )
    return 'applied'
  }
  return 'ignored'
}

// ------------------------------------------------------- card payments

/** Whether this invoice can be paid by card: the business has a working Stripe account and something is owing. */
export function payableOnline(invoice: { status: string; totalCents: number; paidCents: number }, profile: { stripeAccountId: string | null; stripeChargesEnabled: boolean }): boolean {
  return invoice.status === InvoiceStatus.ISSUED && balanceCents(invoice) > 0 && canTakeOnlinePayment(profile) && connectConfigured()
}

/**
 * Starts Stripe Checkout for what is owing. The payment is written as
 * PENDING; it becomes a payment on the invoice only when Stripe's signed
 * event confirms it.
 */
export async function startInvoiceCheckout(invoiceId: string, payerEmail: string | null, returnPath: string): Promise<string> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { business: true } })
  if (!invoice || !payableOnline(invoice, invoice.business)) throw new InvoiceError('This invoice can’t be paid online right now.')
  const amount = balanceCents(invoice)
  // One open attempt at a time: an abandoned one is closed before the next starts.
  await prisma.invoicePayment.updateMany({ where: { invoiceId, status: InvoicePaymentStatus.PENDING }, data: { status: InvoicePaymentStatus.FAILED, failureReason: 'Replaced by a newer attempt.' } })
  const payment = await prisma.invoicePayment.create({
    data: { invoiceId, amountCents: amount, method: InvoicePaymentMethod.STRIPE, status: InvoicePaymentStatus.PENDING, provider: 'stripe' },
  })
  const back = new URL(returnPath, SITE_URL)
  const session = await createInvoiceCheckout({
    accountId: invoice.business.stripeAccountId!,
    invoiceId,
    invoicePaymentId: payment.id,
    amountCents: amount,
    currency: invoice.currency,
    description: `Invoice ${invoiceNumberLabel(invoice.number)}`,
    customerEmail: payerEmail,
    successUrl: `${back.toString()}${back.search ? '&' : '?'}paid=1`,
    cancelUrl: `${back.toString()}${back.search ? '&' : '?'}payment=cancelled`,
  })
  await prisma.invoicePayment.update({ where: { id: payment.id }, data: { checkoutSessionId: session.id } })
  return session.url
}

export interface InvoiceCheckoutEvent {
  invoicePaymentId: string
  sessionId: string
  accountId: string | null
  paymentIntentId: string | null
  paymentStatus: string
  amountTotal: number | null
}

/**
 * Stripe says an invoice checkout finished. Checked against our record
 * (same account, same amount, actually paid) before anything changes, and
 * applied once however many times the event arrives.
 */
export async function applyInvoiceCheckout(event: InvoiceCheckoutEvent): Promise<{ ok: boolean; reason?: string; alreadyApplied?: boolean }> {
  if (event.paymentStatus !== 'paid' || !event.paymentIntentId) return { ok: false, reason: 'not_paid' }
  const payment = await prisma.invoicePayment.findUnique({ where: { id: event.invoicePaymentId }, include: { invoice: { include: { business: true, customer: { select: { userId: true } } } } } })
  if (!payment || payment.method !== InvoicePaymentMethod.STRIPE) return { ok: false, reason: 'unknown' }
  if (payment.status === InvoicePaymentStatus.CONFIRMED) return { ok: true, alreadyApplied: true }
  if (payment.invoice.business.stripeAccountId !== event.accountId) return { ok: false, reason: 'account_mismatch' }
  if (payment.checkoutSessionId && payment.checkoutSessionId !== event.sessionId) return { ok: false, reason: 'session_mismatch' }
  if (event.amountTotal !== payment.amountCents) return { ok: false, reason: 'amount_mismatch' }

  const applied = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invoicePayment.updateMany({
      where: { id: payment.id, status: { in: [InvoicePaymentStatus.PENDING, InvoicePaymentStatus.FAILED] } },
      data: { status: InvoicePaymentStatus.CONFIRMED, receivedAt: new Date(), providerRef: event.paymentIntentId, failureReason: null },
    })
    if (claimed.count === 0) return false
    await tx.$executeRaw`INSERT INTO "BusinessCounter" ("businessId", "name", "next") VALUES (${payment.invoice.businessId}, 'receipt', 1) ON CONFLICT DO NOTHING`
    const rows = await tx.$queryRaw<Array<{ issued: number }>>`
      UPDATE "BusinessCounter" SET "next" = "next" + 1 WHERE "businessId" = ${payment.invoice.businessId} AND "name" = 'receipt' RETURNING "next" - 1 AS issued`
    await tx.invoicePayment.update({ where: { id: payment.id }, data: { receiptNumber: Number(rows[0].issued) } })
    const sum = await tx.invoicePayment.aggregate({ where: { invoiceId: payment.invoiceId, status: InvoicePaymentStatus.CONFIRMED }, _sum: { amountCents: true } })
    await tx.invoice.update({ where: { id: payment.invoiceId }, data: { paidCents: sum._sum.amountCents ?? 0 } })
    await audit({ actorId: null, action: 'invoice.payment.confirmed', entityType: 'Invoice', entityId: payment.invoiceId, metadata: { paymentId: payment.id, amountCents: payment.amountCents, provider: 'stripe' } }, tx)
    return true
  })
  if (!applied) return { ok: true, alreadyApplied: true }

  const amount = formatMoney(payment.amountCents, payment.invoice.currency)
  const number = invoiceNumberLabel(payment.invoice.number)
  if (payment.invoice.customer.userId)
    await notify({ userId: payment.invoice.customer.userId, type: NotificationType.PAYMENT_STATUS, title: `Payment confirmed: ${amount}`, body: `Your payment on invoice ${number} went through. Your receipt is ready.`, href: `/invoices/${payment.invoiceId}` })
  const key = decodeBusinessKey(payment.invoice.business.businessKey)
  if (key) await notifyBusiness(key, { type: NotificationType.PAYMENT_STATUS, title: `Paid: invoice ${number}`, body: `${amount} was paid by card.`, href: `/business/invoices/${payment.invoiceId}` }, { email: false })
  return { ok: true, alreadyApplied: false }
}

export async function failInvoiceCheckout(invoicePaymentId: string, reason: string): Promise<void> {
  await prisma.invoicePayment.updateMany({ where: { id: invoicePaymentId, status: InvoicePaymentStatus.PENDING }, data: { status: InvoicePaymentStatus.FAILED, failureReason: reason.slice(0, 300) } })
}
