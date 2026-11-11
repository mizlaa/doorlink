import { pdfResponse } from '@/lib/invoices/access'
import { invoiceByShareToken, receiptPdf } from '@/lib/invoices/service'
import { limitFor } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; paymentId: string }> }) {
  const limited = await limitFor('invoiceShare')
  if (!limited.ok) return new Response('Too many requests', { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } })
  const { token, paymentId } = await params
  const invoice = await invoiceByShareToken(token)
  if (!invoice) return new Response('This link has expired or been turned off.', { status: 404 })
  const file = await receiptPdf(invoice, paymentId)
  if (!file) return new Response('Not found', { status: 404 })
  return pdfResponse(file, true)
}
