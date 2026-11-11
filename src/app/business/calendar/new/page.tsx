import type { Metadata } from 'next'
import { JobStatus } from '@prisma/client'
import { assignableTechnicians } from '@/lib/business/access'
import { businessPage } from '@/lib/business/guard'
import { formatAddress } from '@/lib/business/crm'
import { prisma } from '@/lib/prisma'
import { localDateString, parseDateString } from '@/lib/timezone'
import { Card, Notice, PageHeader } from '@/components/business/ui'
import { BookingForm } from '../VisitForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Book a visit' }

type PageProps = { searchParams: Promise<{ job?: string; customer?: string; date?: string; accepted?: string }> }

const OPEN_JOBS: JobStatus[] = [JobStatus.ACCEPTED, JobStatus.PAYMENT_CONFIRMED, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS]

export default async function NewVisitPage({ searchParams }: PageProps) {
  const gate = await businessPage('MANAGER', '/business/calendar/new')
  if (!gate.ok) return gate.screen
  const { business, session } = gate
  const params = await searchParams

  const [jobs, customers, technicians] = await Promise.all([
    prisma.job.findMany({
      where: { businessId: business.businessId, status: { in: OPEN_JOBS } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reference: true,
        title: true,
        agreedPriceCents: true,
        businessCustomerId: true,
        businessCustomer: { select: { name: true } },
        property: { select: { addressLine: true, suburb: true, state: true, postcode: true } },
        _count: { select: { appointments: true } },
      },
    }),
    prisma.businessCustomer.findMany({ where: { businessId: business.businessId, archivedAt: null }, orderBy: { name: 'asc' }, take: 300, select: { id: true, name: true } }),
    assignableTechnicians(business),
  ])
  const job = jobs.find((j) => j.id === params.job)
  const date = params.date && parseDateString(params.date) ? params.date : localDateString(new Date(Date.now() + 86_400_000), business.timezone)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Book a visit" back={{ href: '/business/calendar', label: 'Calendar' }} />
      {params.accepted === '1' && job && (
        <div className="mb-5">
          <Notice tone="ok">
            <p className="font-semibold">Request accepted. It’s now job {job.reference}.</p>
            <p className="mt-1">
              {job.businessCustomer?.name} · {formatAddress(job.property)}. Book the measure now, or do it later from the calendar.
            </p>
          </Notice>
        </div>
      )}
      <Card>
        <BookingForm
          jobs={jobs.map((j) => ({
            id: j.id,
            label: `${j.businessCustomer?.name ?? 'Customer'} · ${j.title ?? j.reference}`,
            customerId: j.businessCustomerId,
            hint: [formatAddress(j.property), j.reference].filter(Boolean).join(' · '),
          }))}
          customers={customers.map((c) => ({ id: c.id, label: c.name }))}
          technicians={technicians.map((t) => ({ id: t.id, label: t.id === session.userId ? `${t.name} (you)` : t.name }))}
          defaults={{
            jobId: job?.id ?? '',
            customerId: params.customer ?? '',
            date,
            time: '09:00',
            // One person in the business: it's theirs. More: the office chooses.
            technicianId: technicians.length === 1 ? technicians[0].id : '',
            // A job with no price yet and no visit is waiting for its measure.
            kind: job && (job.agreedPriceCents !== null || job._count.appointments > 0) ? 'INSTALL' : 'MEASURE',
          }}
        />
      </Card>
    </div>
  )
}
