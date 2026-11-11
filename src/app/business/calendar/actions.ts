'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { AppointmentStatus } from '@prisma/client'
import { bookAppointment, cancelAppointment, moveAppointment, rescheduleAppointment } from '@/lib/appointments'
import { APPOINTMENT_KINDS, type AppointmentKindId } from '@/lib/appointments/rules'
import { businessAction } from '@/lib/business/guard'
import { mediaUploadsAvailable, newMediaKey, readImageFile, saveMedia } from '@/lib/media'
import { prisma } from '@/lib/prisma'

export type CalendarState = { error?: string; warnings?: string[]; ok?: boolean }

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()
const orNull = (value: string) => (value === '' ? null : value)

function refresh() {
  revalidatePath('/business/calendar')
  revalidatePath('/business')
  revalidatePath('/today')
}

export async function bookAction(_prev: CalendarState, formData: FormData): Promise<CalendarState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const kind = text(formData, 'kind')
  if (!APPOINTMENT_KINDS.some((k) => k.id === kind)) return { error: 'Choose what the visit is for.' }
  const date = text(formData, 'date')
  const result = await bookAppointment(gate.business, gate.session.userId, {
    jobId: orNull(text(formData, 'jobId')),
    customerId: orNull(text(formData, 'customerId')),
    propertyId: orNull(text(formData, 'propertyId')),
    technicianId: orNull(text(formData, 'technicianId')),
    kind: kind as AppointmentKindId,
    title: text(formData, 'title'),
    notes: orNull(text(formData, 'notes')),
    date,
    time: text(formData, 'time'),
    durationMinutes: Number(text(formData, 'duration')),
    confirmWarnings: formData.get('confirm') === '1',
  })
  if (!result.ok) return result.code === 'warning' ? { warnings: result.warnings } : { error: result.error }
  refresh()
  redirect(`/business/calendar?view=day&date=${date}`)
}

export async function rescheduleAction(_prev: CalendarState, formData: FormData): Promise<CalendarState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  const result = await rescheduleAppointment(gate.business, gate.session.userId, {
    id,
    version: Number(text(formData, 'version')),
    technicianId: orNull(text(formData, 'technicianId')),
    date: text(formData, 'date'),
    time: text(formData, 'time'),
    durationMinutes: Number(text(formData, 'duration')),
    notes: orNull(text(formData, 'notes')),
    confirmWarnings: formData.get('confirm') === '1',
  })
  if (!result.ok) return result.code === 'warning' ? { warnings: result.warnings } : { error: result.error }
  refresh()
  revalidatePath(`/business/calendar/${id}`)
  return { ok: true }
}

export async function cancelVisitAction(_prev: CalendarState, formData: FormData): Promise<CalendarState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  const result = await cancelAppointment(gate.business, gate.session.userId, id, text(formData, 'reason'))
  if (!result.ok) return { error: result.error }
  refresh()
  revalidatePath(`/business/calendar/${id}`)
  return { ok: true }
}

const MOVES: AppointmentStatus[] = [AppointmentStatus.BOOKED, AppointmentStatus.EN_ROUTE, AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW]

/**
 * A technician moves their visit along, with notes and photos when they
 * finish. Photos are stored privately against the job; only the customer
 * and the business can open them.
 */
export async function moveVisitAction(_prev: CalendarState, formData: FormData): Promise<CalendarState> {
  const gate = await businessAction('TECHNICIAN')
  if (!gate.ok) return { error: gate.error }
  const id = text(formData, 'id')
  const to = text(formData, 'to') as AppointmentStatus
  if (!MOVES.includes(to)) return { error: 'That step isn’t available.' }

  const photos = []
  for (const file of formData.getAll('photos').slice(0, 6)) {
    const image = await readImageFile(file)
    if (!image) continue
    if (!image.ok) return { error: image.error }
    photos.push(image)
  }
  if (photos.length > 0 && !mediaUploadsAvailable()) return { error: 'Photo uploads aren’t connected yet. Finish without photos, or try again later.' }

  const result = await moveAppointment(gate.business, { userId: gate.session.userId }, id, to, orNull(text(formData, 'notes')))
  if (!result.ok) return { error: result.error }

  if (photos.length > 0) {
    const appointment = await prisma.appointment.findFirst({ where: { id, businessId: gate.business.businessId }, select: { jobId: true } })
    if (appointment?.jobId) {
      const keys: string[] = []
      for (const photo of photos) {
        const key = newMediaKey('jobs', appointment.jobId, photo.type)
        await saveMedia(key, photo.bytes, photo.type)
        keys.push(key)
      }
      await prisma.jobUpdate.create({ data: { jobId: appointment.jobId, authorId: gate.session.userId, note: null, photoKeys: keys } })
    }
  }
  refresh()
  revalidatePath(`/business/calendar/${id}`)
  return { ok: true }
}
