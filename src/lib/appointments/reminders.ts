import 'server-only'

import { AppointmentStatus, NotificationType } from '@prisma/client'
import { emailDeliverable, sendEmailDetailed } from '@/lib/email'
import { sendSms, smsConfigured } from '@/lib/sms'
import { notify } from '@/lib/notifications'
import { businessCard, decodeBusinessKey } from '@/lib/pricing/business'
import { prisma } from '@/lib/prisma'
import { formatInZone, formatTimeRange } from '@/lib/timezone'
import { KIND_LABELS } from './rules'

/**
 * Day-before reminders for booked visits. Each visit is claimed by setting
 * reminderSentAt first, so two runs at once (or a retry) never remind
 * twice. The in-app notice is ours to confirm; an email counts as sent only
 * when the provider accepted it, and that result is what's reported back.
 * A text goes too when Twilio is set up and the customer has a mobile; it
 * is "sent" when Twilio accepts it and "delivered" only when its signed
 * status callback says so.
 */
export async function sendAppointmentReminders(now = new Date()): Promise<{ claimed: number; emailed: number; emailFailed: number; texted: number; textFailed: number }> {
  const from = new Date(now.getTime() + 18 * 3_600_000)
  const to = new Date(now.getTime() + 30 * 3_600_000)
  const due = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.BOOKED, reminderSentAt: null, startsAt: { gte: from, lt: to } },
    select: {
      id: true,
      kind: true,
      startsAt: true,
      endsAt: true,
      technicianId: true,
      jobId: true,
      business: { select: { businessKey: true, timezone: true } },
      customer: { select: { userId: true, name: true, email: true, phone: true } },
      property: { select: { addressLine: true, suburb: true } },
    },
    take: 500,
  })
  let claimed = 0
  let emailed = 0
  let emailFailed = 0
  let texted = 0
  let textFailed = 0
  for (const visit of due) {
    const claim = await prisma.appointment.updateMany({ where: { id: visit.id, reminderSentAt: null }, data: { reminderSentAt: now } })
    if (claim.count === 0) continue
    claimed++
    const tz = visit.business.timezone
    const when = `${formatInZone(visit.startsAt, tz, { weekday: 'long', day: 'numeric', month: 'long' })}, ${formatTimeRange(visit.startsAt, visit.endsAt, tz)}`
    const key = decodeBusinessKey(visit.business.businessKey)
    const company = (key && (await businessCard(key))?.name) || 'Your installer'
    const where = visit.property ? `${visit.property.addressLine}, ${visit.property.suburb}` : 'your property'
    const kind = KIND_LABELS[visit.kind].toLowerCase()

    if (visit.customer?.userId)
      await notify({ userId: visit.customer.userId, type: NotificationType.APPOINTMENT, title: `Reminder: ${kind} tomorrow`, body: `${company} · ${when} at ${where}.`, href: visit.jobId ? `/jobs/${visit.jobId}` : '/portal' })
    if (visit.technicianId)
      await notify({ userId: visit.technicianId, type: NotificationType.APPOINTMENT, title: `Tomorrow: ${kind} for ${visit.customer?.name ?? 'a customer'}`, body: `${when} at ${where}.`, href: '/today' })
    if (visit.customer?.email && emailDeliverable()) {
      const result = await sendEmailDetailed({
        to: visit.customer.email,
        subject: `Reminder: ${company} ${kind} ${formatInZone(visit.startsAt, tz, { weekday: 'long' })}`,
        text: `Hi ${visit.customer.name.split(' ')[0]},\n\nThis is a reminder that ${company} is booked for a ${kind} on ${when} at ${where}.\n\nNeed to change it? Reply to the business directly or open your booking on Doorlink.\n`,
      })
      if (result.ok) emailed++
      else emailFailed++
      await prisma.appointmentEvent.create({ data: { appointmentId: visit.id, type: result.ok ? 'REMINDER_EMAILED' : 'REMINDER_EMAIL_FAILED', actorId: null, note: result.ok ? `Accepted by ${result.via} (${result.id})` : result.error.slice(0, 300) } })
    }
    if (visit.customer?.phone && smsConfigured()) {
      const result = await sendSms(visit.customer.phone, `${company}: reminder of your ${kind} ${when} at ${where}. Reply to the business to change it.`)
      if (result.ok) texted++
      else if (result.configured) textFailed++
      if (result.ok || result.configured)
        await prisma.appointmentEvent.create({ data: { appointmentId: visit.id, type: result.ok ? 'REMINDER_SMS_SENT' : 'REMINDER_SMS_FAILED', actorId: null, note: result.ok ? `sms:${result.id}` : result.error.slice(0, 300) } })
    }
  }
  return { claimed, emailed, emailFailed, texted, textFailed }
}
