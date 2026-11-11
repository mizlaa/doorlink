'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { NotificationType } from '@prisma/client'
import { audit } from '@/lib/audit'
import { businessUserIds } from '@/lib/pricing/business'
import { businessAction } from '@/lib/business/guard'
import { notify } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { dayRange, parseDateString, addDays } from '@/lib/timezone'

export type TeamState = { error?: string; ok?: boolean; message?: string }
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

/**
 * Adds someone to the team by the email they use on Doorlink. They join
 * only when they accept, so nobody is added to a business without knowing.
 */
export async function inviteMemberAction(_prev: TeamState, form: FormData): Promise<TeamState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  const { business, session } = gate
  const email = text(form, 'email').toLowerCase()
  const role = text(form, 'role') === 'MANAGER' ? 'MANAGER' : 'TECHNICIAN'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Enter their email address.' }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } })
  if (!user) return { error: 'There’s no Doorlink account with that email. Ask them to create a free account with it, then add them here.' }
  if ((await businessUserIds(business.key)).includes(user.id)) return { error: 'They already run this business.' }
  const existing = await prisma.businessMember.findUnique({ where: { businessId_userId: { businessId: business.businessId, userId: user.id } } })
  if (existing && existing.status !== 'REMOVED') return { error: existing.status === 'ACTIVE' ? 'They’re already on your team.' : 'They’ve already been invited.' }
  await prisma.businessMember.upsert({
    where: { businessId_userId: { businessId: business.businessId, userId: user.id } },
    update: { role, status: 'INVITED', invitedById: session.userId, removedAt: null, acceptedAt: null },
    create: { businessId: business.businessId, userId: user.id, role, invitedById: session.userId },
  })
  await notify({ userId: user.id, type: NotificationType.TEAM, title: `${business.name} added you to their team`, body: `Accept to see the ${role === 'MANAGER' ? 'business' : 'visits they book for you'}.`, href: '/business/join' })
  await audit({ actorId: session.userId, action: 'team.invite', entityType: 'BusinessProfile', entityId: business.businessId, metadata: { userId: user.id, role } })
  revalidatePath('/business/team')
  return { ok: true, message: `Invited ${user.name}. They’ll see it in their notifications.` }
}

export async function changeRoleAction(_prev: TeamState, form: FormData): Promise<TeamState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  const role = text(form, 'role') === 'MANAGER' ? 'MANAGER' : 'TECHNICIAN'
  const updated = await prisma.businessMember.updateMany({ where: { id: text(form, 'id'), businessId: gate.business.businessId, status: { not: 'REMOVED' } }, data: { role } })
  if (updated.count === 0) return { error: 'That person isn’t on your team.' }
  await audit({ actorId: gate.session.userId, action: 'team.role', entityType: 'BusinessMember', entityId: text(form, 'id'), metadata: { role } })
  revalidatePath('/business/team')
  return { ok: true }
}

/** Removes someone. Their upcoming visits stay booked but lose their technician, so the office sees them as unassigned. */
export async function removeMemberAction(_prev: TeamState, form: FormData): Promise<TeamState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  const member = await prisma.businessMember.findFirst({ where: { id: text(form, 'id'), businessId: gate.business.businessId, status: { not: 'REMOVED' } } })
  if (!member) return { error: 'That person isn’t on your team.' }
  const [, unassigned] = await prisma.$transaction([
    prisma.businessMember.update({ where: { id: member.id }, data: { status: 'REMOVED', removedAt: new Date() } }),
    prisma.appointment.updateMany({ where: { businessId: gate.business.businessId, technicianId: member.userId, status: 'BOOKED', startsAt: { gte: new Date() } }, data: { technicianId: null } }),
  ])
  await audit({ actorId: gate.session.userId, action: 'team.remove', entityType: 'BusinessMember', entityId: member.id, metadata: { userId: member.userId, unassignedVisits: unassigned.count } })
  revalidatePath('/business', 'layout')
  return { ok: true, message: unassigned.count ? `Removed. ${unassigned.count} upcoming visit${unassigned.count === 1 ? ' now needs' : 's now need'} a technician.` : 'Removed.' }
}

/** Time off: no visits can be booked for the technician in these whole days. */
export async function addTimeOffAction(_prev: TeamState, form: FormData): Promise<TeamState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const { business } = gate
  const technicianId = text(form, 'technicianId')
  const from = text(form, 'from')
  const to = text(form, 'to') || from
  if (!parseDateString(from) || !parseDateString(to) || to < from) return { error: 'Choose the first and last day off.' }
  if (addDays(from, 60) < to) return { error: 'Add time off up to 60 days at a time.' }
  const allowed = [...(await businessUserIds(business.key)), ...(await prisma.businessMember.findMany({ where: { businessId: business.businessId, status: 'ACTIVE' }, select: { userId: true } })).map((m) => m.userId)]
  if (!allowed.includes(technicianId)) return { error: 'Choose someone on your team.' }
  const start = dayRange(from, business.timezone)!.start
  const end = dayRange(to, business.timezone)!.end
  const clashes = await prisma.appointment.count({ where: { businessId: business.businessId, technicianId, status: { in: ['BOOKED', 'EN_ROUTE', 'IN_PROGRESS'] }, startsAt: { lt: end }, endsAt: { gt: start } } })
  await prisma.technicianTimeOff.create({ data: { businessId: business.businessId, technicianId, startsAt: start, endsAt: end, reason: text(form, 'reason').slice(0, 200) || null } })
  await audit({ actorId: gate.session.userId, action: 'team.timeoff.add', entityType: 'User', entityId: technicianId, metadata: { from, to } })
  revalidatePath('/business/team')
  return { ok: true, message: clashes ? `Saved. ${clashes} visit${clashes === 1 ? ' is' : 's are'} already booked in that time: move ${clashes === 1 ? 'it' : 'them'} in the calendar.` : 'Saved.' }
}

export async function removeTimeOffAction(_prev: TeamState, form: FormData): Promise<TeamState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  await prisma.technicianTimeOff.deleteMany({ where: { id: text(form, 'id'), businessId: gate.business.businessId } })
  revalidatePath('/business/team')
  return { ok: true }
}

/** The invited person says yes or no. Checked against their own session only. */
export async function answerInviteAction(form: FormData): Promise<void> {
  const session = await getSession()
  if (!session) return
  const id = text(form, 'id')
  const accept = text(form, 'answer') === 'accept'
  const member = await prisma.businessMember.findFirst({ where: { id, userId: session.userId, status: 'INVITED' } })
  if (!member) return
  await prisma.businessMember.update({ where: { id }, data: accept ? { status: 'ACTIVE', acceptedAt: new Date() } : { status: 'REMOVED', removedAt: new Date() } })
  await audit({ actorId: session.userId, action: accept ? 'team.join' : 'team.decline', entityType: 'BusinessMember', entityId: id })
  revalidatePath('/business', 'layout')
  if (accept) redirect(member.role === 'MANAGER' ? '/business' : '/today')
}
