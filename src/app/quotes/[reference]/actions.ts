'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { JobStatus, NotificationType, Prisma } from '@prisma/client'
import { getSession, type Session } from '@/lib/auth'
import { describeSpec, parseSpec } from '@/lib/configurator/options'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { calculateSplit, formatCommissionRate } from '@/lib/commission'
import { commissionBpsForWorker } from '@/lib/commission-settings'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { makeReference } from '@/lib/reference'
import { RbacError, requirePermission } from '@/lib/rbac'
import { businessIsSubscribed, businessWorker, type BusinessKey } from '@/lib/pricing/business'
import { readBookingForm, timingLabel } from '@/lib/pricing/booking'
import { notifyBusiness } from '@/lib/pricing/notify'
import { INSTALLATION_LABELS, motorLabel, productLabel } from '@/lib/pricing/products'

export type BookingState = { error?: string }

class BookingError extends Error {}

/**
 * Accepting an automated quote. In one transaction:
 *
 *  1. the quote is checked to be this customer's and still open
 *  2. a Job is created with the business, at the quoted total, waiting
 *     for the business to schedule it — the same job flow as hiring from
 *     the job board, so scheduling, completion and reviews all work
 *  3. the quote is marked booked, with the site and contact details the
 *     customer gave, which only now reach the business
 *  4. Doorlink's fee is recorded against the job at today's rate (zero
 *     for a fee-free business), the same as a job hired from the board.
 *     It comes out of the business's side; the customer's price is the
 *     quoted total either way
 *
 * A quote can be booked once. The business is told straight after.
 */
export async function bookQuoteAction(_prev: BookingState, formData: FormData): Promise<BookingState> {
  let session: Session
  try {
    session = requirePermission(await getSession(), 'quote:request')
  } catch (error) {
    if (error instanceof RbacError)
      return { error: 'Sign in with the customer account this quote was issued to.' }
    throw error
  }

  const reference = String(formData.get('reference') ?? '')
  const booking = readBookingForm(formData)
  if (!booking.ok) return { error: booking.error }
  const b = booking.data

  let jobId: string
  let key: BusinessKey
  let summary: { product: string; total: string; suburb: string; payout: string; feeRate: number }
  try {
    const quote = await prisma.automatedQuote.findFirst({
      where: { reference, customerId: session.userId },
      include: { options: true },
    })
    if (!quote) return { error: 'Quote not found.' }
    const option = quote.options.find((o) => o.id === b.optionId)
    if (!option) return { error: 'Choose one of the options on this quote.' }

    key = quote.businessOrganizationId
      ? { kind: 'organization', id: quote.businessOrganizationId }
      : { kind: 'user', id: quote.businessUserId! }
    if (!(await businessIsSubscribed(key))) return { error: 'This company isn’t taking bookings right now.' }
    const worker = await businessWorker(key)
    if (!worker) return { error: 'This company isn’t taking bookings right now.' }

    const split = calculateSplit(option.totalIncGstCents, await commissionBpsForWorker(worker.userId))

    const spec = parseSpec(quote.spec)
    const product = `${productLabel(quote.product)} ${quote.widthMm} × ${quote.heightMm} mm`
    const description = [
      `${product}, booked from automated quote ${quote.reference}.`,
      '',
      `Option: ${option.productBrand ?? 'brand not named'} · ${
        option.motorIncluded
          ? `motor included${option.motorBrand ? ` (${motorLabel(quote.product, option.motorBrand)})` : ''}`
          : 'no motor'
      } · ${INSTALLATION_LABELS[option.installation].toLowerCase()}`,
      `Total ${formatMoney(option.totalIncGstCents, option.currency)} inc GST`,
      // The full design stays on the quote; the job carries what the
      // business needs at a glance.
      describeSpec(spec)
        .slice(2, 4)
        .map((row) => `${row.label}: ${row.value}`)
        .join(' · '),
      ...(b.notes ? ['', `Notes: ${b.notes}`] : []),
    ].join('\n')

    jobId = await prisma.$transaction(
      async (tx) => {
        // Re-read inside the transaction: a second click, or a second tab,
        // must not book the same quote twice.
        const fresh = await tx.automatedQuote.findUnique({ where: { id: quote.id }, select: { status: true } })
        if (fresh?.status !== 'ISSUED') throw new BookingError('This quote has already been booked.')

        const job = await tx.job.create({
          data: {
            reference: makeReference('JOB'),
            workerId: worker.userId,
            technicianId: worker.technicianId,
            organizationId: key.kind === 'organization' ? key.id : null,
            customerId: session.userId,
            description,
            agreedPriceCents: option.totalIncGstCents,
            currency: option.currency,
            status: JobStatus.ACCEPTED,
          },
        })
        await tx.jobStatusEvent.create({
          data: {
            jobId: job.id,
            fromStatus: null,
            toStatus: JobStatus.ACCEPTED,
            actorId: session.userId,
            note: `Booked from quote ${quote.reference}`,
          },
        })
        await tx.transaction.create({
          data: {
            reference: makeReference('TXN'),
            jobId: job.id,
            customerId: session.userId,
            workerId: worker.userId,
            grossCents: split.grossCents,
            commissionRateBps: split.commissionRateBps,
            commissionCents: split.commissionCents,
            workerPayoutCents: split.workerPayoutCents,
            currency: option.currency,
            // No payment provider is connected: this records the agreed
            // split, and only a real provider webhook ever marks it paid.
            status: 'PENDING',
          },
        })
        await tx.automatedQuote.update({
          where: { id: quote.id },
          data: {
            status: 'BOOKED',
            acceptedOptionId: option.id,
            bookedAt: new Date(),
            jobId: job.id,
            bookingName: b.name,
            bookingPhone: b.phone,
            bookingAddress: b.address,
            bookingSuburb: b.suburb,
            bookingState: b.state,
            bookingPostcode: b.postcode,
            bookingTiming: b.timing,
            bookingNotes: b.notes,
          },
        })
        return job.id
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    summary = {
      product,
      total: formatMoney(option.totalIncGstCents, option.currency),
      suburb: b.suburb,
      payout: formatMoney(split.workerPayoutCents, option.currency),
      feeRate: split.commissionRateBps,
    }
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return { error: 'This quote has already been booked.' }
    }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  await notifyBusiness(key, {
    type: NotificationType.QUOTE_ACCEPTED,
    title: `New booking: ${summary.product}`,
    body: `${b.name} booked your ${summary.total} quote in ${summary.suburb} (${timingLabel(b.timing)?.toLowerCase()}). ${
      summary.feeRate > 0
        ? `You receive ${summary.payout} after the ${formatCommissionRate(summary.feeRate)} Doorlink fee. `
        : ''
    }Schedule it from the job.`,
    href: `/jobs/${jobId}`,
  })

  revalidatePath(`/quotes/${reference}`)
  redirect(`/jobs/${jobId}?booked=1`)
}
