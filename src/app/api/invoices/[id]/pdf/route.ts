import { getSession } from '@/lib/auth'
import { invoiceForViewer, pdfResponse } from '@/lib/invoices/access'
import { invoicePdf } from '@/lib/invoices/service'

export const dynamic = 'force-dynamic'

/** The issued invoice as a PDF, rendered from its frozen copy. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await invoiceForViewer(await getSession(), (await params).id)
  if (!found) return new Response('Not found', { status: 404 })
  const file = await invoicePdf(found.invoice)
  if (!file) return new Response('Not found', { status: 404 })
  return pdfResponse(file, new URL(request.url).searchParams.get('view') !== '1')
}
