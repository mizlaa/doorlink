import Link from 'next/link'
import { AppointmentStatus, InvoiceStatus } from '@prisma/client'
import { KIND_LABELS } from '@/lib/appointments/rules'
import { formatAddress } from '@/lib/business/crm'
import { parseSpec } from '@/lib/configurator/options'
import { DesignSummary } from '@/components/designer/DesignSummary'
import { invoiceNumberLabel, PAYMENT_STATE_LABELS, paymentState } from '@/lib/invoices/money'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { formatInZone, formatTimeRange } from '@/lib/timezone'

const VISIT_LABELS: Record<AppointmentStatus, string> = {
  BOOKED: 'Booked',
  EN_ROUTE: 'On the way',
  IN_PROGRESS: 'On site',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Missed',
}

/**
 * The work on a job, linked: who and where, the design, the visits and the
 * invoices. The business sees links to manage each; the customer sees their
 * visit times and invoices; a technician sees the visits only.
 */
export async function JobWorkPanel({ jobId, viewer }: { jobId: string; viewer: 'manager' | 'technician' | 'customer' }) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      businessId: true,
      business: { select: { timezone: true } },
      businessCustomer: { select: { id: true, name: true, phone: true, email: true } },
      property: { select: { addressLine: true, suburb: true, state: true, postcode: true, accessNotes: true } },
      design: { select: { id: true, name: true, spec: true } },
      appointments: { orderBy: { startsAt: 'asc' }, select: { id: true, kind: true, status: true, startsAt: true, endsAt: true, technician: { select: { name: true } } } },
      invoices: { where: viewer === 'customer' ? { status: { not: InvoiceStatus.DRAFT } } : {}, orderBy: { createdAt: 'asc' }, select: { id: true, number: true, status: true, totalCents: true, paidCents: true, dueDate: true, currency: true } },
    },
  })
  if (!job?.businessId) return null
  const tz = job.business?.timezone ?? 'Australia/Sydney'
  const visits = job.appointments.filter((a) => viewer !== 'customer' || a.status !== AppointmentStatus.CANCELLED)
  const invoices = viewer === 'technician' ? [] : job.invoices
  const manager = viewer === 'manager'

  return (
    <div className="mb-6 flex flex-col gap-5 rounded-lg border border-line bg-rail p-4">
      {viewer !== 'customer' && job.businessCustomer && (
        <div className="text-sm">
          <h2 className="mb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">Customer</h2>
          {manager ? (
            <Link href={`/business/customers/${job.businessCustomer.id}`} className="font-medium text-signal hover:text-signal-hover">
              {job.businessCustomer.name}
            </Link>
          ) : (
            <p className="font-medium text-graphite">{job.businessCustomer.name}</p>
          )}
          {job.businessCustomer.phone && (
            <a href={`tel:${job.businessCustomer.phone.replace(/\s/g, '')}`} className="block text-graphite-soft">
              {job.businessCustomer.phone}
            </a>
          )}
          {job.property && <p className="text-graphite-soft">{formatAddress(job.property)}</p>}
          {job.property?.accessNotes && <p className="mt-1 text-micro text-zinc-deep">Access: {job.property.accessNotes}</p>}
        </div>
      )}

      {job.design && (
        <div className="text-sm">
          <h2 className="mb-1 text-micro font-semibold uppercase tracking-wide text-zinc-deep">Design</h2>
          <DesignSummary spec={parseSpec(job.design.spec)} title={job.design.name || undefined} compact />
          <Link href={`/configure?spec=${encodeURIComponent(JSON.stringify(parseSpec(job.design.spec)))}`} className="mt-1.5 inline-block font-medium text-signal hover:text-signal-hover">
            Open in 3D
          </Link>
        </div>
      )}

      <div className="text-sm">
        <h2 className="mb-1.5 flex items-center justify-between text-micro font-semibold uppercase tracking-wide text-zinc-deep">
          Visits
          {manager && (
            <Link href={`/business/calendar/new?job=${job.id}`} className="normal-case tracking-normal text-signal hover:text-signal-hover">
              Book a visit
            </Link>
          )}
        </h2>
        {visits.length === 0 ? (
          <p className="text-graphite-soft">{viewer === 'customer' ? 'The business will book a time with you.' : 'None booked yet.'}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visits.map((visit) => {
              const body = (
                <>
                  <span className="block font-medium text-graphite">
                    {KIND_LABELS[visit.kind]} · {formatInZone(visit.startsAt, tz, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatTimeRange(visit.startsAt, visit.endsAt, tz)}
                  </span>
                  <span className="block text-micro text-zinc-deep">
                    {VISIT_LABELS[visit.status]}
                    {visit.technician ? ` · ${visit.technician.name}` : viewer === 'customer' ? '' : ' · no technician yet'}
                  </span>
                </>
              )
              return (
                <li key={visit.id}>
                  {viewer === 'customer' ? (
                    <div>{body}</div>
                  ) : (
                    <Link href={manager ? `/business/calendar/${visit.id}` : `/today#visit-${visit.id}`} className="block hover:text-signal">
                      {body}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {viewer !== 'technician' && (
        <div className="text-sm">
          <h2 className="mb-1.5 flex items-center justify-between text-micro font-semibold uppercase tracking-wide text-zinc-deep">
            Invoices
            {manager && (
              <Link href={`/business/invoices/new?job=${job.id}`} className="normal-case tracking-normal text-signal hover:text-signal-hover">
                {invoices.some((i) => i.status === InvoiceStatus.DRAFT) ? 'Continue draft' : 'Create invoice'}
              </Link>
            )}
          </h2>
          {invoices.length === 0 ? (
            <p className="text-graphite-soft">{viewer === 'customer' ? 'None yet.' : 'Not invoiced yet. Items from the agreed price are filled in for you.'}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={viewer === 'customer' ? `/invoices/${invoice.id}` : invoice.status === InvoiceStatus.DRAFT ? `/business/invoices/${invoice.id}/edit` : `/business/invoices/${invoice.id}`}
                    className="flex items-center justify-between gap-2 hover:text-signal"
                  >
                    <span className="font-medium text-graphite">{invoice.status === InvoiceStatus.DRAFT ? 'Draft invoice' : invoiceNumberLabel(invoice.number)}</span>
                    <span className="text-micro text-zinc-deep">
                      {invoice.status !== InvoiceStatus.DRAFT && `${formatMoney(invoice.totalCents, invoice.currency)} · `}
                      {PAYMENT_STATE_LABELS[paymentState(invoice)]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
