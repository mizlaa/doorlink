import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { loadBrand } from '@/lib/branding/brand'
import { businessPage } from '@/lib/business/guard'
import { formatAddress } from '@/lib/business/crm'
import { isValidAbn } from '@/lib/business-details'
import type { LineKindId } from '@/lib/invoices/money'
import { jobPaidCents, loadInvoice } from '@/lib/invoices/service'
import { prisma } from '@/lib/prisma'
import { addDays, localDateString } from '@/lib/timezone'
import { Card, Notice, PageHeader } from '@/components/business/ui'
import { Steps } from '../../Steps'
import { EditForm } from './EditForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invoice items' }

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await businessPage('MANAGER', `/business/invoices/${id}/edit`)
  if (!gate.ok) return gate.screen
  const { business } = gate
  const invoice = await loadInvoice(business.businessId, id)
  if (!invoice) notFound()
  if (invoice.status !== 'DRAFT') redirect(`/business/invoices/${id}`)

  const [brand, stock, paidCents] = await Promise.all([
    loadBrand(business),
    prisma.stockItem.findMany({ where: { businessId: business.businessId, archivedAt: null }, orderBy: { name: 'asc' }, take: 300 }),
    jobPaidCents(invoice.jobId),
  ])
  const gstRegistered = brand.gstRegistered && !!brand.abn && isValidAbn(brand.abn)
  const today = localDateString(new Date(), business.timezone)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Items and price"
        back={{ href: '/business/invoices', label: 'Invoices' }}
        subtitle={
          <>
            For <span className="font-medium text-graphite">{invoice.customer.name}</span>
            {invoice.property ? ` · ${formatAddress(invoice.property)}` : ''}
            {invoice.job ? ` · job ${invoice.job.reference}` : ''}
          </>
        }
      />
      <Steps current={2} />
      {brand.gstRegistered && !gstRegistered && (
        <div className="mb-4">
          <Notice tone="warn">You’re marked as registered for GST, but there’s no valid ABN on file. Add it in Settings before issuing, or this invoice can’t carry GST.</Notice>
        </div>
      )}
      <Card>
        <EditForm
          id={invoice.id}
          gstRegistered={gstRegistered}
          pricesIncludeGst={invoice.pricesIncludeGst}
          dueDate={invoice.dueDate ? localDateString(invoice.dueDate, business.timezone) : addDays(today, brand.invoiceTermsDays)}
          notes={invoice.notes ?? ''}
          paidCents={paidCents}
          termsHint={brand.invoiceTermsDays === 0 ? 'Your terms: due on receipt.' : `Your terms: ${brand.invoiceTermsDays} days.`}
          lines={invoice.lines.map((line) => ({
            kind: line.kind as LineKindId,
            description: line.description,
            quantityX100: line.quantityX100,
            unitPriceCents: line.unitPriceCents,
            gstApplicable: line.gstApplicable,
            stockItemId: line.stockItemId,
          }))}
          stock={stock.map((item) => ({ id: item.id, name: item.name, unit: item.unit, sellPriceCents: item.sellPriceCents, onHand: (item.onHandX100 / 100).toString() }))}
        />
      </Card>
    </div>
  )
}
