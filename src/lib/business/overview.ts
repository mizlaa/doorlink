import 'server-only'

import { AppointmentStatus, InvoiceStatus, JobStatus, ServiceRequestStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { dayRange, localDateString } from '@/lib/timezone'

/** Jobs still being worked: not finished, cancelled or declined. */
export const OPEN_JOB_STATUSES: JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.ACCEPTED,
  JobStatus.AWAITING_PAYMENT,
  JobStatus.PAYMENT_CONFIRMED,
  JobStatus.SCHEDULED,
  JobStatus.IN_PROGRESS,
  JobStatus.BUSINESS_COMPLETED,
  JobStatus.DISPUTED,
]
export const LIVE_VISIT: AppointmentStatus[] = [AppointmentStatus.BOOKED, AppointmentStatus.EN_ROUTE, AppointmentStatus.IN_PROGRESS]

/** The numbers an owner needs first thing: what's waiting on them. */
export async function businessOverview(business: { businessId: string; timezone: string }) {
  const now = new Date()
  const today = dayRange(localDateString(now, business.timezone), business.timezone)!
  const [pendingRequests, newBookings, unscheduledJobs, unassignedVisits, todayVisits, owing, drafts, lowStock] = await Promise.all([
    prisma.serviceRequestRecipient.count({ where: { businessId: business.businessId, status: 'PENDING', request: { status: ServiceRequestStatus.OPEN } } }),
    // Bookings from automated quotes the business hasn't confirmed yet.
    prisma.job.count({ where: { businessId: business.businessId, status: JobStatus.REQUESTED } }),
    prisma.job.findMany({
      where: {
        businessId: business.businessId,
        status: { in: [JobStatus.ACCEPTED, JobStatus.PAYMENT_CONFIRMED, JobStatus.SCHEDULED] },
        appointments: { none: { status: { in: LIVE_VISIT } } },
      },
      select: { id: true, reference: true, title: true, description: true, status: true, createdAt: true, businessCustomer: { select: { name: true } }, property: { select: { suburb: true } } },
      orderBy: { createdAt: 'asc' },
      take: 6,
    }),
    prisma.appointment.count({ where: { businessId: business.businessId, technicianId: null, status: AppointmentStatus.BOOKED, startsAt: { gte: now } } }),
    prisma.appointment.findMany({
      where: { businessId: business.businessId, startsAt: { lt: today.end }, endsAt: { gt: today.start }, status: { not: AppointmentStatus.CANCELLED } },
      select: { id: true, startsAt: true, endsAt: true, status: true, kind: true, technician: { select: { name: true } }, customer: { select: { name: true } }, property: { select: { suburb: true } } },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.invoice.findMany({
      where: { businessId: business.businessId, status: InvoiceStatus.ISSUED, paidCents: { lt: prisma.invoice.fields.totalCents } },
      select: { totalCents: true, paidCents: true, dueDate: true },
    }),
    prisma.invoice.count({ where: { businessId: business.businessId, status: InvoiceStatus.DRAFT } }),
    prisma.stockItem.findMany({ where: { businessId: business.businessId, archivedAt: null, reorderX100: { gt: 0 } }, select: { onHandX100: true, reorderX100: true } }),
  ])
  const overdue = owing.filter((i) => i.dueDate && i.dueDate < now)
  const sum = (rows: typeof owing) => rows.reduce((total, i) => total + i.totalCents - i.paidCents, 0)
  return {
    pendingRequests,
    newBookings,
    unscheduledJobs,
    unassignedVisits,
    todayVisits,
    owingCents: sum(owing),
    owingCount: owing.length,
    overdueCents: sum(overdue),
    overdueCount: overdue.length,
    drafts,
    lowStock: lowStock.filter((s) => s.onHandX100 <= s.reorderX100).length,
  }
}
