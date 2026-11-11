'use server'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { invoiceForViewer } from '@/lib/invoices/access'
import { startInvoiceCheckout } from '@/lib/invoices/delivery'
import { invoiceByShareToken, InvoiceError } from '@/lib/invoices/service'
import { limitFor, tooManyMessage } from '@/lib/rate-limit'

export type PayState = { error?: string }

/** Pay by card as the signed-in customer. Nothing is marked paid until Stripe confirms it. */
export async function payInvoiceAction(_prev: PayState, form: FormData): Promise<PayState> {
  const id = String(form.get('id') ?? '')
  const session = await getSession()
  const found = await invoiceForViewer(session, id)
  if (!found || found.viewer !== 'customer') return { error: 'This invoice isn’t available.' }
  let url: string
  try {
    url = await startInvoiceCheckout(id, session!.email, `/invoices/${id}`)
  } catch (error) {
    return { error: error instanceof InvoiceError ? error.message : 'Card payments are unavailable right now. Try again shortly.' }
  }
  redirect(url)
}

/** Pay by card from a share link. The token is checked again here. */
export async function paySharedInvoiceAction(_prev: PayState, form: FormData): Promise<PayState> {
  const token = String(form.get('token') ?? '')
  const limited = await limitFor('invoiceShare')
  if (!limited.ok) return { error: tooManyMessage(limited) }
  const invoice = await invoiceByShareToken(token)
  if (!invoice) return { error: 'This link has expired or been turned off.' }
  let url: string
  try {
    url = await startInvoiceCheckout(invoice.id, invoice.customer.email, `/i/${token}`)
  } catch (error) {
    return { error: error instanceof InvoiceError ? error.message : 'Card payments are unavailable right now. Try again shortly.' }
  }
  redirect(url)
}
