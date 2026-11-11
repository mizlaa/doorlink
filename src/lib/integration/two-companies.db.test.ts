/**
 * Two separate companies and two separate customers against a real
 * Postgres database: each company reaches only its own records, each
 * customer only their own documents, and the retry/concurrency cases never
 * create a second booking, invoice number or payment.
 *
 * Runs only with DOORLINK_DB_TESTS=1 and a DATABASE_URL pointing at a
 * disposable database (it creates and then deletes its own fixtures).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({ after: (task: unknown) => void (typeof task === 'function' ? (task as () => unknown)() : task) }))

import { InvoicePaymentMethod, InvoicePaymentStatus, Role } from '@prisma/client'
import type { Session } from '@/lib/auth'
import { bookAppointment, moveAppointment } from '@/lib/appointments'
import { businessContexts, resolveJobActor, type BusinessContext } from '@/lib/business/access'
import { ensureBusinessProfile } from '@/lib/business/profile'
import { invoiceForViewer } from '@/lib/invoices/access'
import { applyInvoiceCheckout, sendInvoice } from '@/lib/invoices/delivery'
import { createDraft, issueInvoice, loadInvoice, recordPayment, saveDraft, shareLink } from '@/lib/invoices/service'
import { prisma } from '@/lib/prisma'
import { addDays, localDateString } from '@/lib/timezone'

const run = process.env.DOORLINK_DB_TESTS === '1'
const tag = `iso${Date.now().toString(36)}`
const email = (who: string) => `${tag}-${who}@example.test`

type Fixture = { session: Session; context?: BusinessContext }
const f: Record<'ownerA' | 'ownerB' | 'custA' | 'custB', Fixture> = {} as never
let jobA = ''
let customerA = ''
let invoiceA = ''

async function user(who: string, role: Role): Promise<Session> {
  const u = await prisma.user.create({ data: { email: email(who), name: `${who} ${tag}`, role } })
  return { userId: u.id, email: u.email, name: u.name, role: u.role, organizationId: null }
}

describe.skipIf(!run)('two companies, two customers', () => {
  beforeAll(async () => {
    f.ownerA = { session: await user('ownerA', Role.TECHNICIAN) }
    f.ownerB = { session: await user('ownerB', Role.TECHNICIAN) }
    f.custA = { session: await user('custA', Role.CUSTOMER) }
    f.custB = { session: await user('custB', Role.CUSTOMER) }
    for (const owner of [f.ownerA, f.ownerB]) {
      await ensureBusinessProfile({ kind: 'user', id: owner.session.userId })
      owner.context = (await businessContexts(owner.session))[0]
    }
    const ctxA = f.ownerA.context!
    const customer = await prisma.businessCustomer.create({ data: { businessId: ctxA.businessId, userId: f.custA.session.userId, name: 'Customer A', email: email('custA') } })
    customerA = customer.id
    const job = await prisma.job.create({
      data: { reference: `${tag}-JOB`, description: 'Door for A', status: 'ACCEPTED', businessId: ctxA.businessId, businessCustomerId: customer.id, customerId: f.custA.session.userId, workerId: f.ownerA.session.userId },
    })
    jobA = job.id
    invoiceA = await createDraft(ctxA, f.ownerA.session.userId, { customerId: customer.id, propertyId: null })
    await saveDraft(ctxA, invoiceA, { lines: [{ kind: 'DOOR', description: 'Door', quantityX100: 100, unitPriceCents: 110000, gstApplicable: true }], pricesIncludeGst: true, dueDate: null, notes: null })
  }, 60_000)

  afterAll(async () => {
    const ids = Object.values(f).map((x) => x.session?.userId).filter(Boolean) as string[]
    await prisma.job.deleteMany({ where: { reference: { startsWith: tag } } })
    await prisma.businessProfile.deleteMany({ where: { businessKey: { in: ids.map((id) => `u_${id}`) } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  }, 60_000)

  it('company B cannot read, issue, share, pay or draft from company A’s records', async () => {
    const ctxB = f.ownerB.context!
    expect(await loadInvoice(ctxB.businessId, invoiceA)).toBeNull()
    await expect(issueInvoice(ctxB, f.ownerB.session.userId, invoiceA)).rejects.toThrow()
    await expect(shareLink(ctxB, invoiceA)).rejects.toThrow()
    await expect(recordPayment(ctxB, f.ownerB.session.userId, invoiceA, { amountCents: 100, method: InvoicePaymentMethod.CASH, date: localDateString(new Date(), 'Australia/Sydney'), reference: null, note: null, idempotencyKey: `${tag}-x` })).rejects.toThrow()
    await expect(createDraft(ctxB, f.ownerB.session.userId, { jobId: jobA })).rejects.toThrow()
    await expect(createDraft(ctxB, f.ownerB.session.userId, { customerId: customerA, propertyId: null })).rejects.toThrow()
    const booked = await bookAppointment(ctxB, f.ownerB.session.userId, { jobId: jobA, customerId: null, propertyId: null, technicianId: null, kind: 'MEASURE', title: 'Sneaky', notes: null, date: addDays(localDateString(new Date(), 'Australia/Sydney'), 3), time: '09:00', durationMinutes: 45, confirmWarnings: true })
    expect(booked.ok).toBe(false)
  })

  it('company B and customer B cannot open company A’s job', async () => {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobA } })
    expect(await resolveJobActor(job, f.ownerB.session)).toBeNull()
    expect(await resolveJobActor(job, f.custB.session)).toBeNull()
    expect(await resolveJobActor(job, f.custA.session)).toBe('customer')
    expect(await resolveJobActor(job, f.ownerA.session)).toBe('worker')
  })

  it('issuing twice at once gives one invoice number', async () => {
    const ctxA = f.ownerA.context!
    const [a, b] = await Promise.all([issueInvoice(ctxA, f.ownerA.session.userId, invoiceA), issueInvoice(ctxA, f.ownerA.session.userId, invoiceA)])
    expect(a.number).toBe(b.number)
    expect([a.alreadyIssued, b.alreadyIssued].filter(Boolean)).toHaveLength(1)
    const counter = await prisma.businessCounter.findUnique({ where: { businessId_name: { businessId: ctxA.businessId, name: 'invoice' } } })
    expect(counter?.next).toBe(a.number + 1)
  })

  it('each customer opens only their own invoice', async () => {
    expect((await invoiceForViewer(f.custA.session, invoiceA))?.viewer).toBe('customer')
    expect(await invoiceForViewer(f.custB.session, invoiceA)).toBeNull()
    expect(await invoiceForViewer(f.ownerB.session, invoiceA)).toBeNull()
    expect((await invoiceForViewer(f.ownerA.session, invoiceA))?.viewer).toBe('business')
  })

  it('a double-pressed payment is recorded once', async () => {
    const ctxA = f.ownerA.context!
    const input = { amountCents: 50000, method: InvoicePaymentMethod.BANK_TRANSFER, date: localDateString(new Date(), ctxA.timezone), reference: 'TEST', note: null, idempotencyKey: `${tag}-pay1` }
    const results = await Promise.all([recordPayment(ctxA, f.ownerA.session.userId, invoiceA, input), recordPayment(ctxA, f.ownerA.session.userId, invoiceA, input)])
    expect(results[0].paymentId).toBe(results[1].paymentId)
    expect(await prisma.invoicePayment.count({ where: { invoiceId: invoiceA, status: InvoicePaymentStatus.CONFIRMED } })).toBe(1)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA } })).paidCents).toBe(50000)
  })

  it('a repeated card-payment notification confirms one payment', async () => {
    const ctxA = f.ownerA.context!
    await prisma.businessProfile.update({ where: { id: ctxA.businessId }, data: { stripeAccountId: `acct_${tag}`, stripeChargesEnabled: true } })
    const pending = await prisma.invoicePayment.create({ data: { invoiceId: invoiceA, amountCents: 60000, method: InvoicePaymentMethod.STRIPE, status: InvoicePaymentStatus.PENDING, provider: 'stripe', checkoutSessionId: `cs_${tag}` } })
    const event = { invoicePaymentId: pending.id, sessionId: `cs_${tag}`, accountId: `acct_${tag}`, paymentIntentId: `pi_${tag}`, paymentStatus: 'paid', amountTotal: 60000 }
    const tampered = await applyInvoiceCheckout({ ...event, amountTotal: 1 })
    expect(tampered.ok).toBe(false)
    const outcomes = await Promise.all([applyInvoiceCheckout(event), applyInvoiceCheckout(event), applyInvoiceCheckout(event)])
    expect(outcomes.filter((o) => o.ok && !o.alreadyApplied)).toHaveLength(1)
    const confirmed = await prisma.invoicePayment.findMany({ where: { invoiceId: invoiceA, status: InvoicePaymentStatus.CONFIRMED } })
    expect(confirmed).toHaveLength(2)
    expect(new Set(confirmed.map((p) => p.receiptNumber)).size).toBe(2)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA } })).paidCents).toBe(110000)
  })

  it('two bookings for one technician at the same time: exactly one wins', async () => {
    const ctxA = f.ownerA.context!
    const date = addDays(localDateString(new Date(), ctxA.timezone), 5)
    const input = { jobId: jobA, customerId: null, propertyId: null, technicianId: f.ownerA.session.userId, kind: 'INSTALL' as const, title: 'Install', notes: null, date, time: '10:00', durationMinutes: 120, confirmWarnings: true }
    const results = await Promise.all([bookAppointment(ctxA, f.ownerA.session.userId, input), bookAppointment(ctxA, f.ownerA.session.userId, { ...input, time: '11:00' })])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)?.code).toBe('clash')
    const won = results.find((r) => r.ok) as { id: string }
    const ctxB = f.ownerB.context!
    expect((await moveAppointment(ctxB, { userId: f.ownerB.session.userId }, won.id, 'EN_ROUTE', null)).ok).toBe(false)
  })

  it('a failed send keeps the invoice and a retry sends it once', async () => {
    process.env.DOORLINK_EMAIL_OUTBOX = '1'
    const ctxA = f.ownerA.context!
    const failed = await sendInvoice(ctxA, f.ownerA.session.userId, invoiceA, 'nobody@fail.test')
    expect(failed.ok).toBe(false)
    const sent = await sendInvoice(ctxA, f.ownerA.session.userId, invoiceA, email('custA'))
    expect(sent.ok).toBe(true)
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA }, include: { deliveries: true } })
    expect(invoice.status).toBe('ISSUED')
    expect(invoice.deliveries.map((d) => d.status).sort()).toEqual(['FAILED', 'SENT'])
    expect(await prisma.invoice.count({ where: { businessId: ctxA.businessId } })).toBe(1)
  })
})
