import { getSession } from '@/lib/auth'
import { invoiceForViewer, pdfResponse } from '@/lib/invoices/access'
import { receiptPdf } from '@/lib/invoices/service'

export const dynamic = 'force-dynamic'

/** A receipt for one confirmed payment. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params
  const found = await invoiceForViewer(await getSession(), id)
  if (!found) return new Response('Not found', { status: 404 })
  const file = await receiptPdf(found.invoice, paymentId)
  if (!file) return new Response('Not found', { status: 404 })
  return pdfResponse(file, new URL(request.url).searchParams.get('view') !== '1')
}
