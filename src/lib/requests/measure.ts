import 'server-only'

import { JobStatus, NotificationType, Prisma } from '@prisma/client'
import { z } from 'zod'
import { AU_STATES, isAuPostcode } from '@/lib/australia'
import { isAuPhone } from '@/lib/business-details'
import { describeSpec, familyOf, parseSpec, specAsBrief, type DoorSpec } from '@/lib/configurator/options'
import { upsertBusinessCustomer, upsertProperty } from '@/lib/business/crm'
import { profileKey } from '@/lib/business/profile'
import type { BusinessContext } from '@/lib/business/access'
import { notify } from '@/lib/notifications'
import { businessCard, businessWorker } from '@/lib/pricing/business'
import { eligibleBusinesses } from '@/lib/pricing/compare'
import { notifyBusiness, notifyCustomer } from '@/lib/pricing/notify'
import { productForSpec, productLabel } from '@/lib/pricing/products'
import { prisma } from '@/lib/prisma'
import { makeReference } from '@/lib/reference'

/**
 * A customer's free request for an on-site measure.
 *
 * It is made once, from the designer, and carries the design and the
 * address with it. Every local company the customer chose is asked; the
 * first to accept gets a job with the customer, the property and the
 * design already attached, and the others are told it has gone.
 */

export const PREFERRED_TIMES = [
  { id: 'weekday-am', label: 'Weekday mornings' },
  { id: 'weekday-pm', label: 'Weekday afternoons' },
  { id: 'saturday', label: 'Saturday' },
  { id: 'flexible', label: 'I’m flexible' },
] as const

export function preferredTimesLabel(value: string | null): string | null {
  if (!value) return null
  const labels = value
    .split(',')
    .map((id) => PREFERRED_TIMES.find((t) => t.id === id)?.label)
    .filter(Boolean)
  return labels.length ? labels.join(', ') : null
}

/** How many companies one request can go to. */
export const MAX_RECIPIENTS = 5

const schema = z.object({
  contactName: z.string().trim().min(2, 'Enter your name.').max(120),
  contactPhone: z.string().trim().refine(isAuPhone, 'Enter an Australian phone number the company can call.'),
  contactEmail: z.string().trim().toLowerCase().email('Enter your email address.'),
  addressLine: z.string().trim().min(3, 'Enter the street address.').max(200),
  suburb: z.string().trim().min(2, 'Enter the suburb.').max(60),
  state: z.enum(AU_STATES, { message: 'Choose a state.' }),
  postcode: z.string().trim().refine(isAuPostcode, 'Postcodes are 4 digits.'),
  notes: z
    .string()
    .trim()
    .max(1000, 'Keep notes under 1000 characters.')
    .transform((v) => (v === '' ? null : v)),
  idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Reload the page and try again.'),
})

export type MeasureInput = z.infer<typeof schema> & { preferredTimes: string | null; businessKeys: string[]; spec: DoorSpec }

export function readMeasureForm(formData: FormData): { ok: true; data: MeasureInput } | { ok: false; error: string } {
  const get = (key: string) => String(formData.get(key) ?? '')
  const parsed = schema.safeParse({
    contactName: get('contactName'),
    contactPhone: get('contactPhone'),
    contactEmail: get('contactEmail'),
    addressLine: get('addressLine'),
    suburb: get('suburb'),
    state: get('state'),
    postcode: get('postcode'),
    notes: get('notes'),
    idempotencyKey: get('idempotencyKey'),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  let spec: DoorSpec
  try {
    spec = parseSpec(JSON.parse(get('spec')))
  } catch {
    return { ok: false, error: 'The design could not be read. Go back to the designer and try again.' }
  }
  const times = formData
    .getAll('preferredTimes')
    .map(String)
    .filter((id) => PREFERRED_TIMES.some((t) => t.id === id))
  return {
    ok: true,
    data: {
      ...parsed.data,
      preferredTimes: times.length ? times.join(',') : null,
      businessKeys: formData.getAll('business').map(String).slice(0, 20),
      spec,
    },
  }
}

export function designTitle(spec: DoorSpec): string {
  const rows = describeSpec(spec)
  const type = rows[0]?.value ?? 'Door'
  return familyOf(spec.productType) === 'garage' ? `${type} garage door` : type
}

/**
 * Creates the request and asks the chosen local companies. Safe to call
 * twice with the same idempotency key: the second call returns the first
 * request.
 */
export async function createMeasureRequest(customerId: string, input: MeasureInput): Promise<{ reference: string; recipients: number; created: boolean }> {
  const existing = await prisma.serviceRequest.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { reference: true, customerId: true, _count: { select: { recipients: true } } },
  })
  if (existing && existing.customerId === customerId) return { reference: existing.reference, recipients: existing._count.recipients, created: false }

  const { product } = productForSpec(input.spec)
  const eligible = await eligibleBusinesses(product, input.postcode)
  const chosen = (input.businessKeys.length > 0 ? eligible.filter((e) => input.businessKeys.includes(e.profile.businessKey)) : eligible).slice(
    0,
    MAX_RECIPIENTS
  )
  const title = designTitle(input.spec)

  let request
  try {
    request = await prisma.$transaction(async (tx) => {
      // The design is saved to the customer's account, so it is theirs to keep and reuse.
      const design = await tx.doorConfiguration.create({
        data: {
          userId: customerId,
          name: `${title}, measure request`,
          spec: input.spec as unknown as Prisma.InputJsonValue,
          shareSlug: makeReference('CFG').toLowerCase(),
        },
      })
      return tx.serviceRequest.create({
        data: {
          reference: makeReference('REQ'),
          customerId,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          addressLine: input.addressLine,
          suburb: input.suburb,
          state: input.state,
          postcode: input.postcode,
          designId: design.id,
          spec: input.spec as unknown as Prisma.InputJsonValue,
          product,
          widthMm: input.spec.widthMm,
          heightMm: input.spec.heightMm,
          preferredTimes: input.preferredTimes,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          recipients: { create: chosen.map((c) => ({ businessId: c.profile.id })) },
        },
      })
    })
  } catch (error) {
    // Two submissions racing with the same key: the loser reads the winner's.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.serviceRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { reference: true, customerId: true, _count: { select: { recipients: true } } },
      })
      if (winner && winner.customerId === customerId) return { reference: winner.reference, recipients: winner._count.recipients, created: false }
    }
    throw error
  }

  await Promise.all(
    chosen.map((c) =>
      notifyBusiness(profileKey(c.profile), {
        type: NotificationType.SERVICE_REQUEST,
        title: `Measure request: ${title} in ${input.suburb}`,
        body: `${input.contactName.split(' ')[0]} would like an on-site measure for a ${productLabel(product).toLowerCase()} ${input.spec.widthMm} × ${input.spec.heightMm} mm. Accept it to get their details.`,
        href: '/business/requests',
      })
    )
  )
  return { reference: request.reference, recipients: chosen.length, created: true }
}

export class RequestError extends Error {}

/**
 * A company accepts. In one transaction the request is taken (if it is
 * still open), the other companies are released, and the company gets a
 * customer, a property and a job carrying the design. Only one company
 * can win, however many press the button at once.
 */
export async function acceptMeasureRequest(context: BusinessContext, requestId: string, actorId: string): Promise<{ jobId: string }> {
  const worker = await businessWorker(context.key)
  if (!worker) throw new RequestError('This business has no owner account to hold the job.')

  const result = await prisma.$transaction(
    async (tx) => {
      const recipient = await tx.serviceRequestRecipient.findUnique({
        where: { requestId_businessId: { requestId, businessId: context.businessId } },
        include: { request: true },
      })
      if (!recipient) throw new RequestError('Request not found.')
      const taken = await tx.serviceRequest.updateMany({
        where: { id: requestId, status: 'OPEN' },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      })
      if (taken.count === 0)
        throw new RequestError(
          recipient.request.status === 'CANCELLED' ? 'The customer cancelled this request.' : 'Another company has already accepted this request.'
        )
      const request = recipient.request
      await tx.serviceRequestRecipient.update({ where: { id: recipient.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } })
      await tx.serviceRequestRecipient.updateMany({
        where: { requestId, id: { not: recipient.id }, status: 'PENDING' },
        data: { status: 'MISSED', respondedAt: new Date() },
      })

      const customer = await upsertBusinessCustomer(tx, context.businessId, {
        userId: request.customerId,
        name: request.contactName,
        email: request.contactEmail,
        phone: request.contactPhone,
      })
      const property = await upsertProperty(tx, context.businessId, customer.id, request)
      const spec = parseSpec(request.spec)
      const title = designTitle(spec)
      const job = await tx.job.create({
        data: {
          reference: makeReference('JOB'),
          title: `${title}: measure and quote`,
          description: [
            `${title}, from measure request ${request.reference}.`,
            '',
            specAsBrief(spec),
            ...(request.notes ? ['', `Customer notes: ${request.notes}`] : []),
          ].join('\n'),
          status: JobStatus.ACCEPTED,
          businessId: context.businessId,
          businessCustomerId: customer.id,
          propertyId: property.id,
          designId: request.designId,
          serviceRequestId: request.id,
          customerId: request.customerId,
          workerId: worker.userId,
          technicianId: worker.technicianId,
          organizationId: context.key.kind === 'organization' ? context.key.id : null,
        },
      })
      await tx.jobStatusEvent.create({
        data: { jobId: job.id, fromStatus: null, toStatus: JobStatus.ACCEPTED, actorId, note: `Accepted measure request ${request.reference}` },
      })
      return { jobId: job.id, request, missed: await tx.serviceRequestRecipient.findMany({ where: { requestId, status: 'MISSED' }, include: { business: true } }) }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  ).catch((error) => {
    // A serialisation failure means someone else got there in the same instant.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
      throw new RequestError('Another company has already accepted this request.')
    throw error
  })

  await notifyCustomer(result.request.customerId, {
    type: NotificationType.SERVICE_REQUEST,
    title: `${context.name} accepted your measure request`,
    body: 'They’ll be in touch to book a time. You can follow it from your bookings.',
    href: `/measure/${result.request.reference}`,
  })
  for (const other of result.missed) {
    const card = await businessCard(profileKey(other.business))
    if (!card) continue
    await notifyBusiness(
      profileKey(other.business),
      {
        type: NotificationType.SERVICE_REQUEST,
        title: 'A measure request was taken',
        body: `Request ${result.request.reference} in ${result.request.suburb} was accepted by another company.`,
        href: '/business/requests',
      },
      { email: false }
    )
  }
  return { jobId: result.jobId }
}

/** A company passes. When every company has, the customer is told and the request closes. */
export async function declineMeasureRequest(context: BusinessContext, requestId: string, reason: string | null): Promise<void> {
  const updated = await prisma.serviceRequestRecipient.updateMany({
    where: { requestId, businessId: context.businessId, status: 'PENDING' },
    data: { status: 'DECLINED', respondedAt: new Date(), declineReason: reason },
  })
  if (updated.count === 0) throw new RequestError('This request has already been answered.')
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { recipients: { select: { status: true } } },
  })
  if (!request || request.status !== 'OPEN') return
  if (request.recipients.every((r) => r.status === 'DECLINED')) {
    const closed = await prisma.serviceRequest.updateMany({ where: { id: requestId, status: 'OPEN' }, data: { status: 'CLOSED' } })
    if (closed.count > 0)
      await notify({
        userId: request.customerId,
        type: NotificationType.SERVICE_REQUEST,
        title: 'No company could take your measure request',
        body: 'The companies you asked can’t take it right now. You can send it to others from the designer.',
        href: `/measure/${request.reference}`,
      })
  }
}

export async function cancelMeasureRequest(customerId: string, reference: string): Promise<boolean> {
  const result = await prisma.serviceRequest.updateMany({
    where: { reference, customerId, status: 'OPEN' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  })
  return result.count > 0
}
