'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { JobStatus, NotificationType, PaymentKind } from '@prisma/client'
import { getSession, type Session } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { can, requireSession } from '@/lib/rbac'
import { jobActorFor } from '@/lib/marketplace'
import { formatMoney } from '@/lib/money'
import { notify } from '@/lib/notifications'
import { notifyCustomer } from '@/lib/pricing/notify'
import { parseMoney } from '@/lib/pricing/validation'
import { canTakeOnlinePayment, loadBusinessProfile } from '@/lib/business/profile'
import { encodeBusinessKey } from '@/lib/pricing/business'
import { connectConfigured } from '@/lib/payments/connect'
import { createJobTransactions, outstandingPayment, startCheckout } from '@/lib/payments/job-payments'
import { mediaUploadsAvailable, newMediaKey, readImageFile, saveMedia } from '@/lib/media'

export type FlowState = { error?: string; ok?: boolean }

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

async function loadFor(session: Session, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { automatedQuote: { select: { id: true, reference: true, comparisonId: true, businessOrganizationId: true, businessUserId: true } } },
  })
  if (!job) return null
  const actor = jobActorFor(job, session.userId, can(session.role, 'job:write:any'))
  return actor ? { job, actor } : null
}

async function businessProfileFor(job: { organizationId: string | null; workerId: string | null }) {
  const key = job.organizationId
    ? encodeBusinessKey({ kind: 'organization', id: job.organizationId })
    : job.workerId
      ? encodeBusinessKey({ kind: 'user', id: job.workerId })
      : null
  return key ? loadBusinessProfile(key) : null
}

async function moveStatus(jobId: string, from: JobStatus, to: JobStatus, actorId: string | null, note: string | null, data: object = {}) {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.job.updateMany({ where: { id: jobId, status: from }, data: { status: to, ...data } })
    if (moved.count === 0) return false
    await tx.jobStatusEvent.create({ data: { jobId, fromStatus: from, toStatus: to, actorId, note } })
    return true
  })
}

/**
 * The business confirms a booking request. A fixed price stands; for an
 * estimate the business sets the final price (after inspecting the site
 * if needed). The payments due are recorded, with Doorlink's fee on each,
 * and the customer is asked to accept and pay.
 */
export async function confirmBookingAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const session = requireSession(await getSession())
  const loaded = await loadFor(session, String(formData.get('jobId') ?? ''))
  if (!loaded || loaded.actor === 'customer') return { error: 'Job not found.' }
  const { job } = loaded
  if (job.status !== JobStatus.REQUESTED) return { error: 'This booking has already been answered.' }

  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || null
  let price = job.agreedPriceCents ?? 0
  let exGst = job.agreedExGstCents ?? price
  if (job.priceType === 'ESTIMATE') {
    const final = parseMoney(String(formData.get('finalPrice') ?? ''))
    if (final === null || final <= 0 || final > 100_000_000) return { error: 'Enter the final price in dollars, including GST.' }
    // Keep the quote's GST proportion: an estimate changes the amount, not the tax treatment.
    exGst = price > 0 ? Math.round((final * exGst) / price) : final
    price = final
  }
  if (price <= 0) return { error: 'This job has no price to confirm.' }

  const profile = await businessProfileFor(job)
  const online = !!profile && canTakeOnlinePayment(profile) && connectConfigured()
  const ok = await prisma.$transaction(async (tx) => {
    const moved = await tx.job.updateMany({
      where: { id: job.id, status: JobStatus.REQUESTED },
      data: {
        status: JobStatus.AWAITING_PAYMENT,
        agreedPriceCents: price,
        agreedExGstCents: exGst,
        businessNote: note,
        businessConfirmedAt: new Date(),
        depositPercent: job.depositPercent ?? 100,
      },
    })
    if (moved.count === 0) return false
    await tx.jobStatusEvent.create({
      data: {
        jobId: job.id,
        fromStatus: JobStatus.REQUESTED,
        toStatus: JobStatus.AWAITING_PAYMENT,
        actorId: session.userId,
        note: `Confirmed at ${formatMoney(price, job.currency)}${note ? `. ${note}` : ''}`,
      },
    })
    await createJobTransactions(
      tx,
      {
        id: job.id,
        customerId: job.customerId,
        workerId: job.workerId,
        agreedPriceCents: price,
        agreedExGstCents: exGst,
        currency: job.currency,
        depositPercent: job.depositPercent ?? 100,
      },
      online ? profile!.stripeAccountId : null
    )
    return true
  })
  if (!ok) return { error: 'This booking has already been answered.' }

  if (job.customerId)
    await notifyCustomer(job.customerId, {
      type: NotificationType.BOOKING_UPDATE,
      title: 'Your chosen business accepted your job',
      body: `Final price ${formatMoney(price, job.currency)}. Review it and ${online ? 'pay securely' : 'accept it'} to lock in your booking.`,
      href: `/jobs/${job.id}`,
    })
  revalidatePath(`/jobs/${job.id}`)
  return { ok: true }
}

export async function declineBookingAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const session = requireSession(await getSession())
  const loaded = await loadFor(session, String(formData.get('jobId') ?? ''))
  if (!loaded || loaded.actor === 'customer') return { error: 'Job not found.' }
  const { job } = loaded
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500)
  if (!reason) return { error: 'Tell the customer why, briefly.' }

  const moved = await moveStatus(job.id, JobStatus.REQUESTED, JobStatus.DECLINED, session.userId, reason, {
    declinedReason: reason,
    cancelledAt: new Date(),
  })
  if (!moved) return { error: 'This booking has already been answered.' }
  if (job.automatedQuote) {
    await prisma.automatedQuote.update({
      where: { id: job.automatedQuote.id },
      data: { status: 'DECLINED', declinedReason: reason },
    })
  }
  const comparison = job.automatedQuote?.comparisonId
    ? await prisma.quoteComparison.findUnique({ where: { id: job.automatedQuote.comparisonId }, select: { reference: true } })
    : null
  if (job.customerId)
    await notifyCustomer(job.customerId, {
      type: NotificationType.BOOKING_UPDATE,
      title: 'The business can’t take your booking',
      body: `${reason} Your other quotes are still available to choose from.`,
      href: comparison ? `/compare/${comparison.reference}` : '/quotes',
    })
  revalidatePath(`/jobs/${job.id}`)
  return { ok: true }
}

/**
 * The customer accepts the final price and terms. With online payments,
 * they go to Stripe Checkout for the deposit or full amount; the job
 * moves on only when Stripe confirms the payment. Without, they pay the
 * business directly and the job is confirmed now.
 */
export async function acceptAndPayAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const session = requireSession(await getSession())
  const loaded = await loadFor(session, String(formData.get('jobId') ?? ''))
  if (!loaded || loaded.actor !== 'customer') return { error: 'Job not found.' }
  const { job } = loaded
  if (job.status !== JobStatus.AWAITING_PAYMENT) return { error: 'This job isn’t waiting on payment.' }
  if (formData.get('accept') !== 'on') return { error: 'Tick the box to accept the final price and terms.' }

  const payment = await outstandingPayment(job.id, 'upfront')
  if (!payment) return { error: 'Nothing is due on this job right now.' }

  await prisma.job.update({ where: { id: job.id }, data: { termsAcceptedAt: job.termsAcceptedAt ?? new Date() } })

  if (payment.stripeAccountId) {
    if (!connectConfigured()) return { error: 'Online payment is unavailable right now. Try again shortly.' }
    let url: string
    try {
      url = await startCheckout({
        transactionId: payment.id,
        jobId: job.id,
        jobReference: job.reference,
        description: `${payment.kind === PaymentKind.DEPOSIT ? 'Deposit' : 'Payment'} · job ${job.reference}`,
        customerEmail: session.email,
        siteUrl: SITE_URL,
      })
    } catch (error) {
      console.error('Checkout failed', error)
      return { error: 'Payment couldn’t be started. Nothing was charged. Try again in a moment.' }
    }
    redirect(url)
  }

  // Paid directly to the business: the customer's acceptance confirms the job.
  const moved = await moveStatus(
    job.id,
    JobStatus.AWAITING_PAYMENT,
    JobStatus.ACCEPTED,
    session.userId,
    'Customer accepted the final price and terms. Paying the business directly.'
  )
  if (!moved) return { error: 'This job was just updated. Refresh to see it.' }
  if (job.workerId)
    await notify({
      userId: job.workerId,
      type: NotificationType.QUOTE_ACCEPTED,
      title: `Customer accepted: job ${job.reference}`,
      body: `They accepted ${formatMoney(job.agreedPriceCents ?? 0, job.currency)} and will pay you directly. Book a time.`,
      href: `/jobs/${job.id}`,
    })
  revalidatePath(`/jobs/${job.id}`)
  return { ok: true }
}

export async function payBalanceAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const session = requireSession(await getSession())
  const loaded = await loadFor(session, String(formData.get('jobId') ?? ''))
  if (!loaded || loaded.actor !== 'customer') return { error: 'Job not found.' }
  const { job } = loaded
  if (job.status !== JobStatus.BUSINESS_COMPLETED && job.status !== JobStatus.COMPLETED)
    return { error: 'The balance is due once the business finishes the work.' }
  const payment = await outstandingPayment(job.id, 'balance')
  if (!payment?.stripeAccountId) return { error: 'No balance is due through Doorlink.' }
  if (!connectConfigured()) return { error: 'Online payment is unavailable right now.' }
  let url: string
  try {
    url = await startCheckout({
      transactionId: payment.id,
      jobId: job.id,
      jobReference: job.reference,
      description: `Balance · job ${job.reference}`,
      customerEmail: session.email,
      siteUrl: SITE_URL,
    })
  } catch (error) {
    console.error('Checkout failed', error)
    return { error: 'Payment couldn’t be started. Nothing was charged. Try again in a moment.' }
  }
  redirect(url)
}

const UPDATE_STATUSES: JobStatus[] = [
  JobStatus.ACCEPTED,
  JobStatus.PAYMENT_CONFIRMED,
  JobStatus.SCHEDULED,
  JobStatus.IN_PROGRESS,
  JobStatus.BUSINESS_COMPLETED,
]

/** A progress note from the business, with up to four photos. The customer is told. */
export async function postJobUpdateAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const session = requireSession(await getSession())
  const loaded = await loadFor(session, String(formData.get('jobId') ?? ''))
  if (!loaded || loaded.actor === 'customer') return { error: 'Job not found.' }
  const { job } = loaded
  if (!UPDATE_STATUSES.includes(job.status)) return { error: 'Updates can be posted while the job is under way.' }

  const note = String(formData.get('note') ?? '').trim().slice(0, 1000)
  const files = formData.getAll('photos').slice(0, 4)
  const photos = []
  for (const file of files) {
    const image = await readImageFile(file)
    if (!image) continue
    if (!image.ok) return { error: image.error }
    photos.push(image)
  }
  if (!note && photos.length === 0) return { error: 'Add a note or a photo.' }
  if (photos.length > 0 && !mediaUploadsAvailable()) return { error: 'Photo uploads aren’t connected yet.' }

  const photoKeys: string[] = []
  for (const photo of photos) {
    const key = newMediaKey('jobs', job.id, photo.type)
    await saveMedia(key, photo.bytes, photo.type)
    photoKeys.push(key)
  }
  await prisma.jobUpdate.create({ data: { jobId: job.id, authorId: session.userId, note: note || null, photoKeys } })
  if (job.customerId)
    await notifyCustomer(
      job.customerId,
      {
        type: NotificationType.BOOKING_UPDATE,
        title: `Update on job ${job.reference}`,
        body: note || `${photoKeys.length} new photo${photoKeys.length === 1 ? '' : 's'}.`,
        href: `/jobs/${job.id}`,
      },
      { email: false }
    )
  revalidatePath(`/jobs/${job.id}`)
  return { ok: true }
}
