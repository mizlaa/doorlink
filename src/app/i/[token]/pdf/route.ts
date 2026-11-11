import { pdfResponse } from '@/lib/invoices/access'
import { invoiceByShareToken, invoicePdf } from '@/lib/invoices/service'
import { limitFor } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** The PDF behind a share link. The link is the only credential, so guessing is rate limited. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await limitFor('invoiceShare')
  if (!limited.ok) return new Response('Too many requests', { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } })
  const invoice = await invoiceByShareToken((await params).token)
  if (!invoice) return new Response('This link has expired or been turned off.', { status: 404 })
  const file = await invoicePdf(invoice)
  if (!file) return new Response('Not found', { status: 404 })
  return pdfResponse(file, true)
}
