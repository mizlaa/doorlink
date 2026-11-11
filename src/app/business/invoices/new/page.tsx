import type { Metadata } from 'next'
import { JobStatus } from '@prisma/client'
import { businessPage } from '@/lib/business/guard'
import { formatAddress } from '@/lib/business/crm'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { Card, PageHeader } from '@/components/business/ui'
import { Steps } from '../Steps'
import { StartForm } from './StartForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'New invoice' }

const BILLABLE: JobStatus[] = [JobStatus.ACCEPTED, JobStatus.PAYMENT_CONFIRMED, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS, JobStatus.BUSINESS_COMPLETED, JobStatus.COMPLETED]

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ job?: string; customer?: string }> }) {
  const gate = await businessPage('MANAGER', '/business/invoices/new')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const params = await searchParams

  const [jobs, customers] = await Promise.all([
    prisma.job.findMany({
      where: {
        businessId: business.businessId,
        status: { in: BILLABLE },
        businessCustomerId: { not: null },
        // Jobs that haven't been invoiced yet come first; one with an issued invoice drops off.
        invoices: { none: { status: 'ISSUED' } },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 30,
      select: { id: true, reference: true, title: true, agreedPriceCents: true, currency: true, businessCustomer: { select: { name: true } }, property: { select: { addressLine: true, suburb: true, state: true, postcode: true } } },
    }),
    prisma.businessCustomer.findMany({
      where: { businessId: business.businessId, archivedAt: null },
      orderBy: { name: 'asc' },
      take: 400,
      select: { id: true, name: true, email: true, phone: true, properties: { take: 1, orderBy: { createdAt: 'desc' }, select: { suburb: true, postcode: true } } },
    }),
  ])
  const preselected = params.job && jobs.some((j) => j.id === params.job) ? `job:${params.job}` : params.customer && customers.some((c) => c.id === params.customer) ? `customer:${params.customer}` : null

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New invoice" back={{ href: '/business/invoices', label: 'Invoices' }} />
      <Steps current={1} />
      <Card>
        <StartForm
          preselected={preselected}
          jobs={jobs.map((j) => ({
            value: `job:${j.id}`,
            title: `${j.businessCustomer?.name ?? 'Customer'} · ${j.title ?? j.reference}`,
            detail: [formatAddress(j.property), j.reference].filter(Boolean).join(' · '),
            amount: j.agreedPriceCents !== null ? formatMoney(j.agreedPriceCents, j.currency) : null,
          }))}
          customers={customers.map((c) => ({
            value: `customer:${c.id}`,
            title: c.name,
            detail: [c.properties[0] ? `${c.properties[0].suburb} ${c.properties[0].postcode}` : null, c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details yet',
            amount: null,
          }))}
        />
      </Card>
    </div>
  )
}
