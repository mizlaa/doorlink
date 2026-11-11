'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { InvoicePaymentMethod, Prisma } from '@prisma/client'
import { AU_STATES, isAuPostcode } from '@/lib/australia'
import { isAuPhone } from '@/lib/business-details'
import { upsertBusinessCustomer, upsertProperty } from '@/lib/business/crm'
import { businessAction } from '@/lib/business/guard'
import { parseDollars, readLines } from '@/lib/invoices/money'
import { sendInvoice } from '@/lib/invoices/delivery'
import { createDraft, InvoiceError, issueInvoice, recordPayment, reversePayment, revokeShareLink, saveDraft, shareLink, voidInvoice } from '@/lib/invoices/service'
import { prisma } from '@/lib/prisma'
import { limitFor, tooManyMessage } from '@/lib/rate-limit'

export type InvoiceState = { error?: string; ok?: boolean; message?: string; link?: string }

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

function fail(error: unknown): InvoiceState {
  if (error instanceof InvoiceError) return { error: error.message }
  throw error
}

/** Step 1. A job, an existing customer, or a walk-in typed here. Lands on step 2. */
export async function startInvoiceAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const { business, session } = gate
  const source = text(formData, 'source')
  let id: string
  try {
    if (source.startsWith('job:')) {
      id = await createDraft(business, session.userId, { jobId: source.slice(4) })
    } else if (source.startsWith('customer:')) {
      const customerId = source.slice(9)
      const property = await prisma.property.findFirst({ where: { businessId: business.businessId, customerId }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      id = await createDraft(business, session.userId, { customerId, propertyId: property?.id ?? null })
    } else if (source === 'new') {
      const name = text(formData, 'name')
      const email = text(formData, 'email').toLowerCase()
      const phone = text(formData, 'phone')
      if (name.length < 2) return { error: 'Enter the customer’s name.' }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'That email address doesn’t look right.' }
      if (phone && !isAuPhone(phone)) return { error: 'Enter an Australian phone number, or leave it blank.' }
      const addressLine = text(formData, 'addressLine')
      const suburb = text(formData, 'suburb')
      const state = text(formData, 'state')
      const postcode = text(formData, 'postcode')
      const hasAddress = !!(addressLine || suburb || postcode)
      if (hasAddress) {
        if (addressLine.length < 3 || suburb.length < 2) return { error: 'Enter the street address and suburb, or leave the address blank.' }
        if (!(AU_STATES as readonly string[]).includes(state)) return { error: 'Choose a state.' }
        if (!isAuPostcode(postcode)) return { error: 'Postcodes are 4 digits.' }
      }
      const created = await prisma.$transaction(async (tx) => {
        const customer = await upsertBusinessCustomer(tx, business.businessId, { userId: null, name, email: email || null, phone: phone || null })
        const property = hasAddress ? await upsertProperty(tx, business.businessId, customer.id, { addressLine, suburb, state, postcode }) : null
        return { customerId: customer.id, propertyId: property?.id ?? null }
      })
      id = await createDraft(business, session.userId, created)
    } else {
      return { error: 'Choose a job or a customer.' }
    }
  } catch (error) {
    return fail(error)
  }
  redirect(`/business/invoices/${id}/edit`)
}

/** Step 2. Saves the items and terms, then goes to the preview. */
export async function saveInvoiceAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  const lines = readLines(formData)
  if (!lines.ok) return { error: lines.error }
  try {
    await saveDraft(gate.business, id, {
      lines: lines.lines,
      pricesIncludeGst: text(formData, 'pricesIncludeGst') !== '0',
      dueDate: text(formData, 'dueDate') || null,
      notes: text(formData, 'notes') || null,
    })
  } catch (error) {
    return fail(error)
  }
  revalidatePath(`/business/invoices/${id}`)
  redirect(`/business/invoices/${id}`)
}

/** Step 3. Issues the invoice. Pressing it twice issues once. */
export async function issueInvoiceAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  try {
    await issueInvoice(gate.business, gate.session.userId, id)
  } catch (error) {
    return fail(error)
  }
  revalidatePath(`/business/invoices/${id}`)
  revalidatePath('/business/invoices')
  redirect(`/business/invoices/${id}?issued=1`)
}

export async function sendInvoiceAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const limited = await limitFor('invoiceSend', gate.business.businessId)
  if (!limited.ok) return { error: tooManyMessage(limited) }
  const id = text(formData, 'id')
  try {
    const result = await sendInvoice(gate.business, gate.session.userId, id, text(formData, 'to'))
    revalidatePath(`/business/invoices/${id}`)
    if (!result.ok) return { error: `It wasn’t sent: ${result.error} The invoice is unchanged. You can try again, download the PDF, or copy the link.` }
    return { ok: true, message: 'Sent. It shows as delivered once the customer’s mail server confirms it.' }
  } catch (error) {
    return fail(error)
  }
}

export async function shareInvoiceAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  try {
    if (formData.get('revoke') === '1') {
      await revokeShareLink(gate.business, gate.session.userId, id)
      revalidatePath(`/business/invoices/${id}`)
      return { ok: true, message: 'The link no longer works.' }
    }
    const link = await shareLink(gate.business, id, { rotate: formData.get('rotate') === '1' })
    revalidatePath(`/business/invoices/${id}`)
    return { ok: true, link: new URL(link.path, process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').toString() }
  } catch (error) {
    return fail(error)
  }
}

const METHODS: InvoicePaymentMethod[] = [InvoicePaymentMethod.BANK_TRANSFER, InvoicePaymentMethod.CASH, InvoicePaymentMethod.CARD_IN_PERSON, InvoicePaymentMethod.CHEQUE, InvoicePaymentMethod.OTHER]

export async function recordPaymentAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  const amount = parseDollars(text(formData, 'amount'))
  if (amount === null || amount <= 0) return { error: 'Enter the amount received, in dollars.' }
  const method = text(formData, 'method') as InvoicePaymentMethod
  if (!METHODS.includes(method)) return { error: 'Choose how it was paid.' }
  try {
    const result = await recordPayment(gate.business, gate.session.userId, id, {
      amountCents: amount,
      method,
      date: text(formData, 'date'),
      reference: text(formData, 'reference') || null,
      note: text(formData, 'note') || null,
      idempotencyKey: text(formData, 'idempotencyKey'),
    })
    revalidatePath(`/business/invoices/${id}`)
    revalidatePath('/business/invoices')
    return { ok: true, message: result.duplicate ? 'That payment was already recorded.' : 'Payment recorded. The receipt is ready.' }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return { error: 'Someone else was recording a payment at the same moment. Check the list, then try again if it’s missing.' }
    return fail(error)
  }
}

export async function reversePaymentAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  try {
    await reversePayment(gate.business, gate.session.userId, text(formData, 'paymentId'), text(formData, 'reason'))
  } catch (error) {
    return fail(error)
  }
  revalidatePath(`/business/invoices/${id}`)
  return { ok: true, message: 'Payment reversed.' }
}

export async function voidInvoiceAction(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  const draft = formData.get('draft') === '1'
  try {
    await voidInvoice(gate.business, gate.session.userId, id, draft ? 'Draft discarded' : text(formData, 'reason'))
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/business/invoices')
  if (draft) redirect('/business/invoices')
  revalidatePath(`/business/invoices/${id}`)
  return { ok: true, message: 'Invoice voided.' }
}
