import 'server-only'

import type { Prisma } from '@prisma/client'
import { isAuPostcode } from '@/lib/australia'
import { prisma } from '@/lib/prisma'
import type { BusinessKey } from '@/lib/pricing/business'
import { upsertBusinessCustomer, upsertProperty } from './crm'

type Tx = Prisma.TransactionClient

/**
 * Ties a job to the company's own records: the business it belongs to,
 * that business's customer, and the property when a full address is
 * known. Jobs from measure requests are created linked; jobs booked from
 * automated quotes or the lead marketplace are linked here, at booking or
 * the first time the business opens its job list. Safe to run twice.
 */
export async function linkJob(tx: Tx, jobId: string): Promise<void> {
  const job = await tx.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      businessId: true,
      businessCustomerId: true,
      propertyId: true,
      organizationId: true,
      workerId: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      automatedQuote: { select: { bookingName: true, bookingPhone: true, bookingAddress: true, bookingSuburb: true, bookingState: true, bookingPostcode: true } },
    },
  })
  if (!job || (job.businessId && job.businessCustomerId)) return
  const businessKey = job.organizationId ? `o_${job.organizationId}` : job.workerId ? `u_${job.workerId}` : null
  const business = job.businessId ? { id: job.businessId } : businessKey ? await tx.businessProfile.findUnique({ where: { businessKey }, select: { id: true } }) : null
  if (!business) return
  if (!job.customer) {
    await tx.job.update({ where: { id: job.id }, data: { businessId: business.id } })
    return
  }
  const booking = job.automatedQuote
  const customer = await upsertBusinessCustomer(tx, business.id, {
    userId: job.customer.id,
    name: booking?.bookingName?.trim() || job.customer.name,
    email: job.customer.email,
    phone: booking?.bookingPhone || job.customer.phone,
  })
  let propertyId = job.propertyId
  if (!propertyId && booking?.bookingAddress && booking.bookingSuburb && booking.bookingState && booking.bookingPostcode && isAuPostcode(booking.bookingPostcode)) {
    const property = await upsertProperty(tx, business.id, customer.id, {
      addressLine: booking.bookingAddress,
      suburb: booking.bookingSuburb,
      state: booking.bookingState,
      postcode: booking.bookingPostcode,
    })
    propertyId = property.id
  }
  await tx.job.update({ where: { id: job.id }, data: { businessId: business.id, businessCustomerId: customer.id, propertyId } })
}

/** Links any of a business's older jobs that predate these records. */
export async function linkBusinessJobs(business: { key: BusinessKey }): Promise<number> {
  const where: Prisma.JobWhereInput = business.key.kind === 'organization' ? { organizationId: business.key.id } : { workerId: business.key.id, organizationId: null }
  const loose = await prisma.job.findMany({ where: { ...where, OR: [{ businessId: null }, { businessCustomerId: null, customerId: { not: null } }] }, select: { id: true }, take: 200 })
  for (const job of loose) await prisma.$transaction((tx) => linkJob(tx, job.id))
  return loose.length
}
