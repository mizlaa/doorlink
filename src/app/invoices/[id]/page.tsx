import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { invoiceForViewer } from '@/lib/invoices/access'
import { payInvoiceAction } from '@/lib/invoices/pay-actions'
import { CustomerInvoice } from '@/components/invoices/CustomerInvoice'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invoice', robots: { index: false } }

export default async function CustomerInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; payment?: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/invoices/${id}`)}`)
  const found = await invoiceForViewer(session, id)
  if (!found) notFound()
  if (found.viewer === 'business') redirect(`/business/invoices/${id}`)
  const query = await searchParams
  return (
    <CustomerInvoice
      invoice={found.invoice}
      base={`/api/invoices/${id}`}
      pay={payInvoiceAction}
      payFields={{ id }}
      returned={query.paid === '1' ? 'paid' : query.payment === 'cancelled' ? 'cancelled' : null}
    />
  )
}
