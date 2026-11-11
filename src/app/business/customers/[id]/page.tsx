import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { KIND_LABELS } from '@/lib/appointments/rules'
import { businessPage } from '@/lib/business/guard'
import { formatAddress } from '@/lib/business/crm'
import { invoiceNumberLabel, PAYMENT_STATE_LABELS, paymentState } from '@/lib/invoices/money'
import { JOB_STATUS_LABELS } from '@/lib/labels'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { formatInZone } from '@/lib/timezone'
import { Card, PageHeader, PrimaryLink, SecondaryLink, SectionTitle } from '@/components/business/ui'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Customer' }

type HistoryItem = { at: Date; title: string; detail: string; href: string }

/** One customer's service history with this business, property by property. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await businessPage('MANAGER', `/business/customers/${id}`)
  if (!gate.ok) return gate.screen
  const { business } = gate
  const customer = await prisma.businessCustomer.findFirst({
    where: { id, businessId: business.businessId },
    include: {
      properties: { orderBy: { createdAt: 'asc' } },
      jobs: { orderBy: { createdAt: 'desc' }, select: { id: true, reference: true, title: true, description: true, status: true, createdAt: true, propertyId: true } },
      appointments: { orderBy: { startsAt: 'desc' }, select: { id: true, kind: true, status: true, startsAt: true, propertyId: true, completionNotes: true, technician: { select: { name: true } } } },
      invoices: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, totalCents: true, paidCents: true, dueDate: true, issuedAt: true, createdAt: true, currency: true, propertyId: true } },
    },
  })
  if (!customer) notFound()
  const tz = business.timezone
  const history: Array<HistoryItem & { propertyId: string | null }> = [
    ...customer.jobs.map((j) => ({ at: j.createdAt, title: j.title ?? j.description.split('\n')[0], detail: `${j.reference} · ${JOB_STATUS_LABELS[j.status]}`, href: `/jobs/${j.id}`, propertyId: j.propertyId })),
    ...customer.appointments.map((a) => ({ at: a.startsAt, title: `${KIND_LABELS[a.kind]} visit`, detail: `${a.status === 'COMPLETED' ? 'Done' : a.status.toLowerCase().replace('_', ' ')}${a.technician ? ` · ${a.technician.name}` : ''}${a.completionNotes ? ` · ${a.completionNotes.slice(0, 80)}` : ''}`, href: `/business/calendar/${a.id}`, propertyId: a.propertyId })),
    ...customer.invoices.map((i) => ({ at: i.issuedAt ?? i.createdAt, title: i.status === 'DRAFT' ? 'Draft invoice' : `Invoice ${invoiceNumberLabel(i.number)}`, detail: `${i.status === 'DRAFT' ? '' : `${formatMoney(i.totalCents, i.currency)} · `}${PAYMENT_STATE_LABELS[paymentState(i)]}`, href: i.status === 'DRAFT' ? `/business/invoices/${i.id}/edit` : `/business/invoices/${i.id}`, propertyId: i.propertyId })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())
  const owing = customer.invoices.filter((i) => i.status === 'ISSUED').reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0)
  const groups = [...customer.properties.map((p) => ({ key: p.id, label: formatAddress(p), notes: p.accessNotes })), { key: null as string | null, label: 'No address', notes: null }]

  return (
    <>
      <PageHeader
        title={customer.name}
        back={{ href: '/business/customers', label: 'Customers' }}
        subtitle={[customer.phone, customer.email].filter(Boolean).join(' · ') || undefined}
        action={<PrimaryLink href={`/business/invoices/new?customer=${customer.id}`}>New invoice</PrimaryLink>}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {customer.phone && <SecondaryLink href={`tel:${customer.phone.replace(/\s/g, '')}`}>Call</SecondaryLink>}
        <SecondaryLink href={`/business/calendar/new?customer=${customer.id}`}>Book a visit</SecondaryLink>
        {owing > 0 && <span className="self-center text-sm font-semibold text-caution">{formatMoney(owing)} owing</span>}
      </div>
      <div className="flex flex-col gap-6">
        {groups.map((group) => {
          const items = history.filter((h) => h.propertyId === group.key)
          if (items.length === 0 && group.key === null) return null
          return (
            <Card key={group.key ?? 'none'}>
              <SectionTitle>{group.label}</SectionTitle>
              {group.notes && <p className="mb-2 text-micro text-zinc-deep">Access: {group.notes}</p>}
              {items.length === 0 ? (
                <p className="text-sm text-graphite-soft">No work here yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {items.map((item, i) => (
                    <li key={`${item.href}-${i}`}>
                      <Link href={item.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-signal">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-graphite">{item.title}</span>
                          <span className="block truncate text-micro text-zinc-deep">{item.detail}</span>
                        </span>
                        <span className="shrink-0 text-micro text-zinc-deep">{formatInZone(item.at, tz, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
