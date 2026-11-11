import type { Metadata } from 'next'
import { invoiceByShareToken } from '@/lib/invoices/service'
import { paySharedInvoiceAction } from '@/lib/invoices/pay-actions'
import { limitFor } from '@/lib/rate-limit'
import { CustomerInvoice } from '@/components/invoices/CustomerInvoice'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false }, referrer: 'no-referrer' }

/**
 * An invoice opened from a link the business shared. The link is signed,
 * expires, can be turned off, and only its hash is stored.
 */
export default async function SharedInvoicePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; payment?: string }> }) {
  const { token } = await params
  const limited = await limitFor('invoiceShare')
  const invoice = limited.ok ? await invoiceByShareToken(token) : null
  if (!invoice)
    return (
      <div className="mx-auto max-w-prose px-4 py-16">
        <h1 className="text-xl font-semibold text-graphite">{limited.ok ? 'This link has expired' : 'Too many requests'}</h1>
        <p className="mt-2 text-sm text-graphite-soft">
          {limited.ok ? 'Invoice links expire or can be turned off by the business. Ask them to send a fresh one.' : 'Wait a few minutes and try again.'}
        </p>
      </div>
    )
  const query = await searchParams
  return (
    <CustomerInvoice
      invoice={invoice}
      base={`/i/${token}`}
      pay={paySharedInvoiceAction}
      payFields={{ token }}
      returned={query.paid === '1' ? 'paid' : query.payment === 'cancelled' ? 'cancelled' : null}
    />
  )
}
