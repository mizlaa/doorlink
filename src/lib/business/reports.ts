import 'server-only'

import { AppointmentStatus, InvoicePaymentStatus, InvoiceStatus, JobStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { localDateString } from '@/lib/timezone'

export const PERIODS = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last 12 months', days: 365 },
] as const

/**
 * The business's numbers for a period, all from its own records: money
 * actually received (confirmed payments), what is still owed and how late,
 * jobs finished, and visits per technician.
 */
export async function businessReport(business: { businessId: string; timezone: string }, days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000)
  const [payments, open, completedJobs, cancelledJobs, visits, invoiced] = await Promise.all([
    prisma.invoicePayment.findMany({
      where: { invoice: { businessId: business.businessId }, status: InvoicePaymentStatus.CONFIRMED, receivedAt: { gte: since } },
      select: { amountCents: true, receivedAt: true, method: true },
    }),
    prisma.invoice.findMany({
      where: { businessId: business.businessId, status: InvoiceStatus.ISSUED, paidCents: { lt: prisma.invoice.fields.totalCents } },
      select: { totalCents: true, paidCents: true, dueDate: true },
    }),
    prisma.job.findMany({ where: { businessId: business.businessId, status: JobStatus.COMPLETED, completedAt: { gte: since } }, select: { createdAt: true, completedAt: true } }),
    prisma.job.count({ where: { businessId: business.businessId, status: { in: [JobStatus.CANCELLED, JobStatus.DECLINED] }, updatedAt: { gte: since } } }),
    prisma.appointment.findMany({
      where: { businessId: business.businessId, startsAt: { gte: since, lt: new Date(now.getTime() + 14 * 86_400_000) }, status: { not: AppointmentStatus.CANCELLED } },
      select: { technicianId: true, status: true, startsAt: true, endsAt: true, technician: { select: { name: true } } },
    }),
    prisma.invoice.aggregate({ where: { businessId: business.businessId, status: InvoiceStatus.ISSUED, issuedAt: { gte: since } }, _sum: { totalCents: true, gstCents: true }, _count: { _all: true } }),
  ])

  // Received, by month in the business's time zone.
  const byMonth = new Map<string, number>()
  for (const p of payments) {
    const month = localDateString(p.receivedAt, business.timezone).slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + p.amountCents)
  }
  const received = payments.reduce((s, p) => s + p.amountCents, 0)

  // Unpaid, by how late.
  const buckets = [
    { label: 'Not due yet', min: -Infinity, max: 0, cents: 0, count: 0 },
    { label: '1–30 days late', min: 1, max: 30, cents: 0, count: 0 },
    { label: '31–60 days late', min: 31, max: 60, cents: 0, count: 0 },
    { label: 'Over 60 days late', min: 61, max: Infinity, cents: 0, count: 0 },
  ]
  for (const invoice of open) {
    const late = invoice.dueDate ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000) : 0
    const bucket = buckets.find((b) => late >= b.min && late <= b.max) ?? buckets[0]
    bucket.cents += invoice.totalCents - invoice.paidCents
    bucket.count++
  }

  const turnaround = completedJobs.length
    ? completedJobs.reduce((s, j) => s + (j.completedAt!.getTime() - j.createdAt.getTime()) / 86_400_000, 0) / completedJobs.length
    : null

  // Visits and booked hours per technician: done in the period, and booked for the next two weeks.
  const people = new Map<string, { name: string; done: number; upcoming: number; hours: number; missed: number }>()
  for (const v of visits) {
    const key = v.technicianId ?? 'none'
    const row = people.get(key) ?? { name: v.technician?.name ?? 'No technician', done: 0, upcoming: 0, hours: 0, missed: 0 }
    if (v.status === AppointmentStatus.COMPLETED) row.done++
    else if (v.status === AppointmentStatus.NO_SHOW) row.missed++
    else if (v.startsAt >= now) {
      row.upcoming++
      row.hours += (v.endsAt.getTime() - v.startsAt.getTime()) / 3_600_000
    }
    people.set(key, row)
  }

  return {
    received,
    receivedByMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, cents]) => ({ month, cents })),
    invoicedCents: invoiced._sum.totalCents ?? 0,
    invoicedGstCents: invoiced._sum.gstCents ?? 0,
    invoicedCount: invoiced._count._all,
    unpaid: buckets,
    unpaidTotal: buckets.reduce((s, b) => s + b.cents, 0),
    jobsCompleted: completedJobs.length,
    jobsCancelled: cancelledJobs,
    turnaroundDays: turnaround,
    technicians: [...people.values()].sort((a, b) => b.done + b.upcoming - (a.done + a.upcoming)),
  }
}
