import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { logoUrl } from '@/lib/branding/brand'
import { businessPage } from '@/lib/business/guard'
import { emailDeliverable } from '@/lib/email'
import { balanceCents, invoiceNumberLabel, PAYMENT_STATE_LABELS, paymentState, receiptNumberLabel } from '@/lib/invoices/money'
import { loadInvoice, paymentLines, previewSnapshot } from '@/lib/invoices/service'
import { parseSnapshot, PAYMENT_METHOD_LABELS } from '@/lib/invoices/snapshot'
import { formatMoney } from '@/lib/money'
import { formatInZone, localDateString } from '@/lib/timezone'
import { InvoiceDocument } from '@/components/invoices/InvoiceDocument'
import { Card, Notice, PageHeader, Pill, SecondaryLink, SectionTitle, type PillTone } from '@/components/business/ui'
import { Steps } from '../Steps'
import { PrintLink } from '@/components/invoices/PrintLink'
import { DiscardDraftButton, IssueButton, PaymentForm, ReversePaymentForm, SendForm, ShareForm, VoidForm } from './InvoiceControls'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invoice' }

const STATE_TONE: Record<string, PillTone> = { DRAFT: 'neutral', VOID: 'neutral', UNPAID: 'blue', PARTLY_PAID: 'amber', PAID: 'green', OVERDUE: 'red' }
const DELIVERY_LABELS: Record<string, { label: string; tone: PillTone }> = {
  QUEUED: { label: 'Sending', tone: 'neutral' },
  SENT: { label: 'Sent', tone: 'blue' },
  DELIVERED: { label: 'Delivered', tone: 'green' },
  FAILED: { label: 'Not sent', tone: 'red' },
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string }> }) {
  const { id } = await params
  const gate = await businessPage('MANAGER', `/business/invoices/${id}`)
  if (!gate.ok) return gate.screen
  const { business } = gate
  const invoice = await loadInvoice(business.businessId, id)
  if (!invoice) notFound()
  const tz = business.timezone

  if (invoice.status === 'DRAFT') {
    const snapshot = await previewSnapshot(business, invoice)
    return (
      <div className="mx-auto max-w-3xl">
        <div className="print:hidden">
        <PageHeader title="Preview and issue" back={{ href: `/business/invoices/${id}/edit`, label: 'Items and price' }} subtitle="This is exactly what your customer will receive." />
        <Steps current={3} />
        {invoice.lines.length === 0 && (
          <div className="mb-4">
            <Notice tone="warn">There are no items yet. Go back and add at least one.</Notice>
          </div>
        )}
        </div>
        <InvoiceDocument snapshot={snapshot} logoUrl={logoUrl(business.profile.logoVersionId)} />
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
          <IssueButton id={id} />
          <div className="flex gap-2">
            <SecondaryLink href={`/business/invoices/${id}/edit`}>Edit items</SecondaryLink>
            <DiscardDraftButton id={id} />
          </div>
        </div>
      </div>
    )
  }

  const snapshot = parseSnapshot(invoice.snapshot)
  if (!snapshot) notFound()
  const state = paymentState(invoice)
  const owing = balanceCents(invoice)
  const payments = paymentLines(invoice, tz)
  const confirmed = invoice.payments.filter((p) => p.status === 'CONFIRMED')
  const shareActive = !!invoice.shareTokenHash && !!invoice.shareTokenExpiresAt && invoice.shareTokenExpiresAt.getTime() > Date.now()
  const issued = (await searchParams).issued === '1'

  return (
    <>
      <div className="print:hidden">
      <PageHeader
        title={`Invoice ${invoiceNumberLabel(invoice.number)}`}
        back={{ href: '/business/invoices', label: 'Invoices' }}
        subtitle={
          <>
            {invoice.customer.name} · {formatMoney(invoice.totalCents, invoice.currency)}
            {owing > 0 && invoice.status === 'ISSUED' ? ` · ${formatMoney(owing, invoice.currency)} owing` : ''}
          </>
        }
        action={<Pill tone={STATE_TONE[state]}>{PAYMENT_STATE_LABELS[state]}</Pill>}
      />
      {issued && (
        <div className="mb-5">
          <Notice tone="ok">
            <span className="font-semibold">Issued as {invoiceNumberLabel(invoice.number)}.</span> Send it, share the link or download the PDF.
          </Notice>
        </div>
      )}
      {invoice.status === 'VOID' && (
        <div className="mb-5">
          <Notice tone="warn">
            <span className="font-semibold">Void.</span> {invoice.voidReason}
          </Notice>
        </div>
      )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] print:block">
        <div className="min-w-0">
          <InvoiceDocument
            snapshot={snapshot}
            logoUrl={logoUrl(invoice.logoVersionId)}
            payments={payments}
            voided={invoice.status === 'VOID'}
          />
        </div>

        <aside className="flex flex-col gap-5 print:hidden">
          <Card>
            <a
              href={`/api/invoices/${id}/pdf`}
              className="flex h-12 w-full items-center justify-center rounded bg-signal text-sm font-semibold text-paper hover:bg-signal-hover"
            >
              Download PDF
            </a>
            <PrintLink />
            {invoice.job && (
              <Link href={`/jobs/${invoice.job.id}`} className="mt-3 block text-center text-sm font-medium text-signal hover:text-signal-hover">
                Job {invoice.job.reference}
              </Link>
            )}
          </Card>

          {invoice.status === 'ISSUED' && (
            <>
              <Card>
                <SectionTitle>Send</SectionTitle>
                <SendForm id={id} defaultTo={invoice.customer.email ?? ''} deliverable={emailDeliverable()} />
                {invoice.deliveries.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-sm">
                    {invoice.deliveries.slice(0, 5).map((delivery) => (
                      <li key={delivery.id}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-graphite">{delivery.recipient}</span>
                          <Pill tone={DELIVERY_LABELS[delivery.status].tone}>{DELIVERY_LABELS[delivery.status].label}</Pill>
                        </span>
                        <span className="block text-micro text-zinc-deep">
                          {formatInZone(delivery.createdAt, tz, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                          {delivery.error ? ` · ${delivery.error}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <SectionTitle>Share a link</SectionTitle>
                <ShareForm id={id} active={shareActive} />
              </Card>

              {owing > 0 && (
                <Card>
                  <SectionTitle>Record a payment</SectionTitle>
                  <PaymentForm id={id} balance={(owing / 100).toFixed(2)} today={localDateString(new Date(), tz)} initialKey={randomUUID().replace(/-/g, '')} />
                </Card>
              )}
            </>
          )}

          {invoice.payments.length > 0 && (
            <Card>
              <SectionTitle>Payments</SectionTitle>
              <ul className="flex flex-col gap-3 text-sm">
                {invoice.payments.map((payment) => (
                  <li key={payment.id}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold tabular-nums text-graphite">{formatMoney(payment.amountCents, invoice.currency)}</span>
                      <Pill tone={payment.status === 'CONFIRMED' ? 'green' : payment.status === 'PENDING' ? 'amber' : 'neutral'}>
                        {payment.status === 'CONFIRMED' ? 'Received' : payment.status === 'PENDING' ? 'Awaiting Stripe' : payment.status === 'REVERSED' ? 'Reversed' : 'Not completed'}
                      </Pill>
                    </span>
                    <span className="block text-micro text-zinc-deep">
                      {PAYMENT_METHOD_LABELS[payment.method]} · {formatInZone(payment.receivedAt, tz, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                      {payment.method === 'STRIPE' && payment.status === 'CONFIRMED' ? ' · confirmed by Stripe' : ''}
                      {payment.recordedById ? ' · recorded by your business' : ''}
                    </span>
                    {payment.failureReason && <span className="block text-micro text-zinc-deep">{payment.failureReason}</span>}
                    {payment.status === 'CONFIRMED' && (
                      <span className="mt-1 flex items-center gap-3">
                        <a href={`/api/invoices/${id}/receipts/${payment.id}`} className="text-micro font-medium text-signal hover:text-signal-hover">
                          Receipt {receiptNumberLabel(payment.receiptNumber)}
                        </a>
                        {payment.method !== 'STRIPE' && business.role === 'OWNER' && <ReversePaymentForm id={id} paymentId={payment.id} />}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {invoice.status === 'ISSUED' && confirmed.length === 0 && business.role === 'OWNER' && <VoidForm id={id} />}
        </aside>
      </div>
    </>
  )
}
