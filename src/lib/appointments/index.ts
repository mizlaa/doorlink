import 'server-only'

import { AppointmentKind, AppointmentStatus, JobStatus, NotificationType, Prisma, TransactionStatus } from '@prisma/client'
import { assignableTechnicians, roleAtLeast, type BusinessContext } from '@/lib/business/access'
import { AUTO_COMPLETE_DAYS } from '@/lib/marketplace'
import { notify } from '@/lib/notifications'
import { notifyCustomer } from '@/lib/pricing/notify'
import { prisma } from '@/lib/prisma'
import { makeReference } from '@/lib/reference'
import { formatTimeRange, formatWhen } from '@/lib/timezone'
import { canMove, isLive, KIND_LABELS, LIVE_STATUSES, slotFromForm, withinWorkingHours, type AppointmentKindId } from './rules'

/**
 * Booking, moving and finishing visits.
 *
 * A technician can never hold two live visits at once. Booking and
 * rescheduling take a per-technician lock inside the transaction and then
 * look for a clash, so two staff pressing "Book" in the same second are
 * handled one after the other; and the database carries an exclusion
 * constraint (prisma/constraints.sql) that refuses an overlap whatever
 * wrote it. Either way the second booking gets a clear "already booked"
 * and nothing is saved.
 */

type Tx = Prisma.TransactionClient

export type BookingResult =
  | { ok: true; id: string; reference: string }
  | { ok: false; error: string; code: 'invalid' | 'clash' | 'stale' | 'warning'; warnings?: string[] }

export interface BookingInput {
  jobId: string | null
  customerId: string | null
  propertyId: string | null
  technicianId: string | null
  kind: AppointmentKindId
  title: string
  notes: string | null
  date: string
  time: string
  durationMinutes: number
  /** The booker has seen the warnings and wants it anyway. */
  confirmWarnings: boolean
}

const LIVE = LIVE_STATUSES as AppointmentStatus[]

class Clash extends Error {
  constructor(public detail: string) {
    super(detail)
  }
}
class Stale extends Error {}

/** Postgres refusing an overlap through the exclusion constraint. */
function isExclusionViolation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${(error as { code?: string }).code ?? ''}` : ''
  return text.includes('23P01') || text.includes('Appointment_no_technician_overlap')
}

async function lockTechnician(tx: Tx, technicianId: string) {
  // Held until the transaction ends. One key per technician, so different
  // technicians never wait on each other.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${technicianId}`}))`
}

async function findClash(tx: Tx, technicianId: string, startsAt: Date, endsAt: Date, exceptId?: string) {
  return tx.appointment.findFirst({
    where: {
      technicianId,
      status: { in: LIVE },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { reference: true, title: true, startsAt: true, endsAt: true, timezone: true },
    orderBy: { startsAt: 'asc' },
  })
}

/** Things worth a second look that don't stop a booking: outside working hours, on leave, in the past. */
async function softWarnings(context: BusinessContext, technicianId: string | null, startsAt: Date, endsAt: Date): Promise<string[]> {
  const warnings: string[] = []
  if (startsAt.getTime() < Date.now() - 5 * 60_000) warnings.push('That time is in the past.')
  if (!technicianId) return warnings
  const [hours, leave] = await Promise.all([
    prisma.workerAvailability.findMany({
      where: { worker: { userId: technicianId } },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    prisma.technicianTimeOff.findFirst({
      where: { businessId: context.businessId, technicianId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      select: { reason: true, startsAt: true, endsAt: true },
    }),
  ])
  if (!withinWorkingHours(startsAt, endsAt, context.timezone, hours)) warnings.push('That’s outside the technician’s usual working hours.')
  if (leave) warnings.push(`The technician is marked as away then${leave.reason ? ` (${leave.reason})` : ''}.`)
  return warnings
}

async function ownsRecords(context: BusinessContext, input: Pick<BookingInput, 'jobId' | 'customerId' | 'propertyId' | 'technicianId'>) {
  const [job, customer, property, technicians] = await Promise.all([
    input.jobId ? prisma.job.findFirst({ where: { id: input.jobId, businessId: context.businessId }, select: { id: true, businessCustomerId: true, propertyId: true, customerId: true, reference: true } }) : null,
    input.customerId ? prisma.businessCustomer.findFirst({ where: { id: input.customerId, businessId: context.businessId }, select: { id: true } }) : null,
    input.propertyId ? prisma.property.findFirst({ where: { id: input.propertyId, businessId: context.businessId }, select: { id: true } }) : null,
    assignableTechnicians(context),
  ])
  if (input.jobId && !job) return { ok: false as const, error: 'That job isn’t one of yours.' }
  if (input.customerId && !customer) return { ok: false as const, error: 'That customer isn’t one of yours.' }
  if (input.propertyId && !property) return { ok: false as const, error: 'That property isn’t one of yours.' }
  if (input.technicianId && !technicians.some((t) => t.id === input.technicianId)) return { ok: false as const, error: 'Choose a technician from your team.' }
  return { ok: true as const, job }
}

/**
 * Keeps a job in step with its visits: SCHEDULED (with the next visit's
 * time) while one is booked, back to where it was when none is.
 */
export async function syncJobWithAppointments(tx: Tx, jobId: string, actorId: string | null) {
  const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true, status: true, scheduledAt: true } })
  if (!job) return
  const next = await tx.appointment.findFirst({
    where: { jobId, status: { in: LIVE } },
    orderBy: { startsAt: 'asc' },
    select: { startsAt: true },
  })
  const schedulable: JobStatus[] = [JobStatus.ACCEPTED, JobStatus.PAYMENT_CONFIRMED, JobStatus.SCHEDULED]
  if (!schedulable.includes(job.status)) return
  if (next) {
    if (job.status === JobStatus.SCHEDULED && job.scheduledAt?.getTime() === next.startsAt.getTime()) return
    await tx.job.update({ where: { id: jobId }, data: { status: JobStatus.SCHEDULED, scheduledAt: next.startsAt } })
    if (job.status !== JobStatus.SCHEDULED)
      await tx.jobStatusEvent.create({ data: { jobId, fromStatus: job.status, toStatus: JobStatus.SCHEDULED, actorId, note: 'Visit booked.' } })
    return
  }
  if (job.status !== JobStatus.SCHEDULED) return
  // Nothing booked any more: the job waits where it was before it was scheduled.
  const paid = await tx.transaction.count({ where: { jobId, status: TransactionStatus.PAID } })
  const back = paid > 0 ? JobStatus.PAYMENT_CONFIRMED : JobStatus.ACCEPTED
  await tx.job.update({ where: { id: jobId }, data: { status: back, scheduledAt: null } })
  await tx.jobStatusEvent.create({ data: { jobId, fromStatus: JobStatus.SCHEDULED, toStatus: back, actorId, note: 'No visit booked.' } })
}

export async function bookAppointment(context: BusinessContext, actorId: string, input: BookingInput): Promise<BookingResult> {
  if (!roleAtLeast(context.role, 'MANAGER')) return { ok: false, code: 'invalid', error: 'Only the owner or a manager can book visits.' }
  const slot = slotFromForm(input.date, input.time, input.durationMinutes, context.timezone)
  if (!slot.ok) return { ok: false, code: 'invalid', error: slot.error }
  const title = input.title.trim().slice(0, 140)
  if (!title) return { ok: false, code: 'invalid', error: 'Give the visit a short title.' }
  const owned = await ownsRecords(context, input)
  if (!owned.ok) return { ok: false, code: 'invalid', error: owned.error }

  if (!input.confirmWarnings) {
    const warnings = await softWarnings(context, input.technicianId, slot.startsAt, slot.endsAt)
    if (slot.ambiguous) warnings.push('That time happens twice on this date (the clocks go back). The first one is used.')
    if (warnings.length > 0) return { ok: false, code: 'warning', error: warnings.join(' '), warnings }
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (input.technicianId) {
        await lockTechnician(tx, input.technicianId)
        const clash = await findClash(tx, input.technicianId, slot.startsAt, slot.endsAt)
        if (clash) throw new Clash(`${clash.title}, ${formatWhen(clash.startsAt, clash.timezone)} (${clash.reference})`)
      }
      const appointment = await tx.appointment.create({
        data: {
          reference: makeReference('APT'),
          businessId: context.businessId,
          jobId: input.jobId,
          customerId: input.customerId ?? owned.job?.businessCustomerId ?? null,
          propertyId: input.propertyId ?? owned.job?.propertyId ?? null,
          technicianId: input.technicianId,
          kind: input.kind as AppointmentKind,
          title,
          notes: input.notes?.trim().slice(0, 2000) || null,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          timezone: context.timezone,
          createdById: actorId,
          events: { create: { type: 'BOOKED', actorId, note: `Booked for ${formatWhen(slot.startsAt, context.timezone)}.` } },
        },
      })
      if (input.jobId) await syncJobWithAppointments(tx, input.jobId, actorId)
      return appointment
    })
    await announce(context, created.id, 'booked', actorId)
    return { ok: true, id: created.id, reference: created.reference }
  } catch (error) {
    if (error instanceof Clash) return { ok: false, code: 'clash', error: `That technician is already booked then: ${error.detail}.` }
    if (isExclusionViolation(error)) return { ok: false, code: 'clash', error: 'That technician was just booked for that time by someone else.' }
    throw error
  }
}

export interface RescheduleInput {
  id: string
  /** The version the editor loaded; a change made since then is not overwritten. */
  version: number
  technicianId: string | null
  date: string
  time: string
  durationMinutes: number
  notes: string | null
  confirmWarnings: boolean
}

export async function rescheduleAppointment(context: BusinessContext, actorId: string, input: RescheduleInput): Promise<BookingResult> {
  if (!roleAtLeast(context.role, 'MANAGER')) return { ok: false, code: 'invalid', error: 'Only the owner or a manager can move visits.' }
  const existing = await prisma.appointment.findFirst({ where: { id: input.id, businessId: context.businessId } })
  if (!existing) return { ok: false, code: 'invalid', error: 'Visit not found.' }
  if (!isLive(existing.status) || existing.status === 'IN_PROGRESS') return { ok: false, code: 'invalid', error: 'Only a booked visit can be moved.' }
  const slot = slotFromForm(input.date, input.time, input.durationMinutes, existing.timezone)
  if (!slot.ok) return { ok: false, code: 'invalid', error: slot.error }
  const owned = await ownsRecords(context, { jobId: null, customerId: null, propertyId: null, technicianId: input.technicianId })
  if (!owned.ok) return { ok: false, code: 'invalid', error: owned.error }
  if (!input.confirmWarnings) {
    const warnings = await softWarnings(context, input.technicianId, slot.startsAt, slot.endsAt)
    if (warnings.length > 0) return { ok: false, code: 'warning', error: warnings.join(' '), warnings }
  }

  const moved = existing.startsAt.getTime() !== slot.startsAt.getTime() || existing.endsAt.getTime() !== slot.endsAt.getTime()
  const reassigned = existing.technicianId !== input.technicianId
  try {
    await prisma.$transaction(async (tx) => {
      // Lock both the old and new technician in a fixed order, so two moves can't deadlock.
      for (const id of [...new Set([existing.technicianId, input.technicianId].filter((v): v is string => !!v))].sort()) await lockTechnician(tx, id)
      if (input.technicianId) {
        const clash = await findClash(tx, input.technicianId, slot.startsAt, slot.endsAt, existing.id)
        if (clash) throw new Clash(`${clash.title}, ${formatWhen(clash.startsAt, clash.timezone)} (${clash.reference})`)
      }
      const updated = await tx.appointment.updateMany({
        where: { id: existing.id, businessId: context.businessId, version: input.version, status: { in: [AppointmentStatus.BOOKED, AppointmentStatus.EN_ROUTE] } },
        data: {
          technicianId: input.technicianId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          notes: input.notes?.trim().slice(0, 2000) || null,
          status: AppointmentStatus.BOOKED,
          version: { increment: 1 },
          // A moved visit gets a fresh reminder.
          ...(moved ? { reminderSentAt: null } : {}),
        },
      })
      if (updated.count === 0) throw new Stale()
      await tx.appointmentEvent.create({
        data: {
          appointmentId: existing.id,
          type: moved ? 'RESCHEDULED' : reassigned ? 'REASSIGNED' : 'UPDATED',
          actorId,
          note: moved
            ? `Moved from ${formatWhen(existing.startsAt, existing.timezone)} to ${formatWhen(slot.startsAt, existing.timezone)}.`
            : reassigned
              ? 'Technician changed.'
              : 'Details updated.',
        },
      })
      if (existing.jobId) await syncJobWithAppointments(tx, existing.jobId, actorId)
    })
    if (moved || reassigned) await announce(context, existing.id, moved ? 'moved' : 'reassigned', actorId)
    return { ok: true, id: existing.id, reference: existing.reference }
  } catch (error) {
    if (error instanceof Clash) return { ok: false, code: 'clash', error: `That technician is already booked then: ${error.detail}.` }
    if (error instanceof Stale) return { ok: false, code: 'stale', error: 'Someone else just changed this visit. Reload to see it, then try again.' }
    if (isExclusionViolation(error)) return { ok: false, code: 'clash', error: 'That technician was just booked for that time by someone else.' }
    throw error
  }
}

export async function cancelAppointment(context: BusinessContext, actorId: string, id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!roleAtLeast(context.role, 'MANAGER')) return { ok: false, error: 'Only the owner or a manager can cancel visits.' }
  const text = reason.trim().slice(0, 500)
  if (!text) return { ok: false, error: 'Say why, so the customer and the team have a record.' }
  const done = await prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findFirst({ where: { id, businessId: context.businessId }, select: { id: true, jobId: true, status: true } })
    if (!existing || !isLive(existing.status)) return false
    const updated = await tx.appointment.updateMany({
      where: { id, status: { in: LIVE } },
      data: { status: AppointmentStatus.CANCELLED, cancelledAt: new Date(), cancelReason: text, version: { increment: 1 } },
    })
    if (updated.count === 0) return false
    await tx.appointmentEvent.create({ data: { appointmentId: id, type: 'CANCELLED', actorId, note: text } })
    if (existing.jobId) await syncJobWithAppointments(tx, existing.jobId, actorId)
    return true
  })
  if (!done) return { ok: false, error: 'This visit has already finished or been cancelled.' }
  await announce(context, id, 'cancelled', actorId, text)
  return { ok: true }
}

/**
 * A technician (or the office) moves a visit along: on the way, started,
 * completed, nobody home. Starting a visit starts its job; completing an
 * installation, service or repair marks the job finished for the customer
 * to confirm. A completed measure leaves the job waiting for its price.
 */
export async function moveAppointment(
  context: BusinessContext,
  actor: { userId: string },
  id: string,
  to: AppointmentStatus,
  notes: string | null
): Promise<{ ok: boolean; error?: string }> {
  const appointment = await prisma.appointment.findFirst({
    where: { id, businessId: context.businessId },
    include: { job: { select: { id: true, status: true, reference: true, customerId: true, workerId: true } } },
  })
  if (!appointment) return { ok: false, error: 'Visit not found.' }
  // A technician works their own visits; the office can move any.
  if (!roleAtLeast(context.role, 'MANAGER') && appointment.technicianId !== actor.userId) return { ok: false, error: 'Visit not found.' }
  if (!canMove(appointment.status, to)) return { ok: false, error: 'That step isn’t available for this visit any more.' }
  if (to === AppointmentStatus.CANCELLED) return { ok: false, error: 'Cancel a visit from the calendar, with a reason.' }

  const text = notes?.trim().slice(0, 2000) || null
  const now = new Date()
  const finished = to === AppointmentStatus.COMPLETED
  const jobDone = finished && appointment.kind !== AppointmentKind.MEASURE
  let jobBusinessCompleted = false

  const moved = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.updateMany({
      where: { id, status: appointment.status },
      data: {
        status: to,
        version: { increment: 1 },
        ...(finished ? { completedAt: now, completionNotes: text } : {}),
      },
    })
    if (updated.count === 0) return false
    await tx.appointmentEvent.create({ data: { appointmentId: id, type: to, actorId: actor.userId, note: text } })

    const job = appointment.job
    if (!job) return true
    if (to === AppointmentStatus.IN_PROGRESS && job.status === JobStatus.SCHEDULED) {
      await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.IN_PROGRESS, startedAt: now } })
      await tx.jobStatusEvent.create({ data: { jobId: job.id, fromStatus: job.status, toStatus: JobStatus.IN_PROGRESS, actorId: actor.userId, note: 'Technician started on site.' } })
    }
    if (finished) {
      if (text) await tx.jobUpdate.create({ data: { jobId: job.id, authorId: actor.userId, note: `${KIND_LABELS[appointment.kind]} completed. ${text}` } })
      const others = await tx.appointment.count({ where: { jobId: job.id, status: { in: LIVE }, id: { not: id } } })
      const current = (await tx.job.findUnique({ where: { id: job.id }, select: { status: true } }))?.status
      if (jobDone && others === 0 && current === JobStatus.IN_PROGRESS) {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.BUSINESS_COMPLETED,
            businessCompletedAt: now,
            autoCompleteAt: new Date(now.getTime() + AUTO_COMPLETE_DAYS * 86_400_000),
          },
        })
        await tx.jobStatusEvent.create({ data: { jobId: job.id, fromStatus: JobStatus.IN_PROGRESS, toStatus: JobStatus.BUSINESS_COMPLETED, actorId: actor.userId, note: 'Work completed on site.' } })
        jobBusinessCompleted = true
      } else if (!jobDone && current === JobStatus.IN_PROGRESS) {
        // A measure is done; the job goes back to waiting for its price.
        await tx.job.update({ where: { id: job.id }, data: { status: JobStatus.ACCEPTED, scheduledAt: null } })
        await tx.jobStatusEvent.create({ data: { jobId: job.id, fromStatus: JobStatus.IN_PROGRESS, toStatus: JobStatus.ACCEPTED, actorId: actor.userId, note: 'Measure completed. Awaiting price.' } })
      } else {
        await syncJobWithAppointments(tx, job.id, actor.userId)
      }
    }
    if (to === AppointmentStatus.NO_SHOW) await syncJobWithAppointments(tx, job.id, actor.userId)
    return true
  })
  if (!moved) return { ok: false, error: 'This visit was just updated by someone else. Reload to see it.' }

  const job = appointment.job
  if (job?.customerId) {
    if (to === AppointmentStatus.EN_ROUTE)
      await notifyCustomer(job.customerId, {
        type: NotificationType.APPOINTMENT,
        title: `${context.name} is on the way`,
        body: `Your ${KIND_LABELS[appointment.kind].toLowerCase()} is booked for ${formatTimeRange(appointment.startsAt, appointment.endsAt, appointment.timezone)}.`,
        href: `/jobs/${job.id}`,
      })
    if (jobBusinessCompleted)
      await notifyCustomer(job.customerId, {
        type: NotificationType.BOOKING_UPDATE,
        title: 'Your job is finished. Please confirm',
        body: `${context.name} has completed job ${job.reference}. Confirm it’s done, or raise a problem.`,
        href: `/jobs/${job.id}`,
      })
    else if (finished && !jobDone)
      await notifyCustomer(job.customerId, {
        type: NotificationType.APPOINTMENT,
        title: 'Your measure is done',
        body: `${context.name} will send your price shortly.`,
        href: `/jobs/${job.id}`,
      }, { email: false })
  }
  return { ok: true }
}

/** Tells the customer and the technician about a booking, a move or a cancellation. */
async function announce(context: BusinessContext, appointmentId: string, what: 'booked' | 'moved' | 'reassigned' | 'cancelled', actorId: string, reason?: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { customer: { select: { userId: true } }, job: { select: { id: true } } },
  })
  if (!appointment) return
  const when = `${formatWhen(appointment.startsAt, appointment.timezone)}`
  const kind = KIND_LABELS[appointment.kind].toLowerCase()
  const href = appointment.job ? `/jobs/${appointment.job.id}` : '/portal'

  if (appointment.customer?.userId && what !== 'reassigned') {
    const title =
      what === 'booked' ? `Your ${kind} is booked` : what === 'moved' ? `Your ${kind} has a new time` : `Your ${kind} was cancelled`
    const body =
      what === 'cancelled'
        ? `${context.name} cancelled the visit on ${when}. ${reason ?? ''}`.trim()
        : `${context.name}: ${when}, about ${Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000)} minutes.`
    await notifyCustomer(appointment.customer.userId, { type: NotificationType.APPOINTMENT, title, body, href })
  }
  if (appointment.technicianId && appointment.technicianId !== actorId) {
    await notify({
      userId: appointment.technicianId,
      type: NotificationType.APPOINTMENT,
      title: what === 'cancelled' ? `Visit cancelled: ${appointment.title}` : what === 'moved' ? `Visit moved: ${appointment.title}` : `New visit: ${appointment.title}`,
      body: what === 'cancelled' ? `${when}. ${reason ?? ''}`.trim() : when,
      href: '/today',
    })
  }
}

export const APPOINTMENT_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  property: { select: { id: true, addressLine: true, suburb: true, state: true, postcode: true, accessNotes: true } },
  technician: { select: { id: true, name: true } },
  job: { select: { id: true, reference: true, title: true, status: true } },
} satisfies Prisma.AppointmentInclude

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>

/** A business's visits in a UTC range, optionally for one technician. */
export async function appointmentsBetween(businessId: string, start: Date, end: Date, technicianId?: string | null) {
  return prisma.appointment.findMany({
    where: {
      businessId,
      startsAt: { lt: end },
      endsAt: { gt: start },
      ...(technicianId === 'unassigned' ? { technicianId: null } : technicianId ? { technicianId } : {}),
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startsAt: 'asc' },
  })
}
