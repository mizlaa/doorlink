import { InvoiceStatus, InvoicePaymentStatus } from '@prisma/client'
import { logoUrl } from '@/lib/branding/brand'
import { payableOnline } from '@/lib/invoices/delivery'
import { balanceCents, PAYMENT_STATE_LABELS, paymentState } from '@/lib/invoices/money'
import type { PayState } from '@/lib/invoices/pay-actions'
import { paymentLines, type InvoiceFull } from '@/lib/invoices/service'
import { parseSnapshot, type PaymentLine } from '@/lib/invoices/snapshot'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { InvoiceDocument } from './InvoiceDocument'
import { PayButton } from './PayButton'

/**
 * What the customer sees, whether signed in or through a share link: the
 * frozen invoice, what's owing, and a way to pay. A return from Stripe only
 * says "processing" until the signed webhook has confirmed the payment.
 */
export async function CustomerInvoice({
  invoice,
  base,
  pay,
  payFields,
  returned,
}: {
  invoice: InvoiceFull
  /** Where PDFs live: `/api/invoices/<id>` or `/i/<token>`. */
  base: string
  pay: (prev: PayState, form: FormData) => Promise<PayState>
  payFields: Record<string, string>
  returned: 'paid' | 'cancelled' | null
}) {
  const snapshot = parseSnapshot(invoice.snapshot)
  if (!snapshot) return null
  const profile = await prisma.businessProfile.findUnique({ where: { id: invoice.businessId }, select: { timezone: true, stripeAccountId: true, stripeChargesEnabled: true } })
  const timezone = profile?.timezone ?? 'Australia/Sydney'
  const payments = paymentLines(invoice, timezone)
  const owing = balanceCents(invoice)
  const state = paymentState(invoice)
  const canPay = !!profile && payableOnline(invoice, profile)
  const pending = invoice.payments.some((p) => p.status === InvoicePaymentStatus.PENDING)
  const receiptFor = (line: PaymentLine) => {
    const payment = invoice.payments.find((p) => p.status === InvoicePaymentStatus.CONFIRMED && p.receiptNumber === line.receiptNumber)
    return payment ? `${base}/receipts/${payment.id}` : null
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">{snapshot.issuer.name}</p>
          <h1 className="text-2xl font-semibold text-graphite">
            {snapshot.title} {snapshot.number}
          </h1>
          <p className="mt-1 text-sm text-graphite-soft">
            {invoice.status === InvoiceStatus.VOID ? 'This invoice was cancelled.' : owing > 0 ? `${formatMoney(owing, invoice.currency)} to pay · ${PAYMENT_STATE_LABELS[state]}` : 'Paid in full. Thank you.'}
          </p>
        </div>
        <a href={`${base}/pdf`} className="inline-flex h-11 items-center justify-center rounded border border-line bg-rail px-4 text-sm font-medium text-graphite hover:bg-paper">
          Download PDF
        </a>
      </div>

      {returned === 'paid' && owing > 0 && (
        <p role="status" className="mb-4 rounded border border-line bg-rail p-3 text-sm text-graphite">
          Thanks. We’re waiting for the card provider to confirm your payment. This page will show it as paid, with a receipt, once it’s confirmed. Refresh in a moment.
        </p>
      )}
      {returned === 'cancelled' && (
        <p role="status" className="mb-4 rounded border border-line bg-rail p-3 text-sm text-graphite">
          The payment was cancelled. Nothing was charged.
        </p>
      )}

      {invoice.status === InvoiceStatus.ISSUED && owing > 0 && (
        <div className="mb-5">
          {canPay && !pending ? (
            <PayButton action={pay} fields={payFields} label={`Pay ${formatMoney(owing, invoice.currency)} by card`} />
          ) : canPay && pending ? (
            <PayButton action={pay} fields={payFields} label={`Try paying ${formatMoney(owing, invoice.currency)} again`} />
          ) : (
            <p className="rounded border border-line bg-rail p-3 text-sm text-graphite-soft">
              {snapshot.footer ? 'Pay using the details on the invoice, or contact the business.' : `Contact ${snapshot.issuer.name} to arrange payment.`}
            </p>
          )}
        </div>
      )}

      <InvoiceDocument snapshot={snapshot} logoUrl={logoUrl(invoice.logoVersionId)} payments={payments} voided={invoice.status === InvoiceStatus.VOID} receiptHref={receiptFor} />
    </div>
  )
}
