'use server'

import { limitFor, tooManyMessage } from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SupportPriority, SupportStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession, type Session } from '@/lib/auth'
import { requireSession, requirePermission, can, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'

export type SupportFormState = { error?: string }

async function ownerOrSupportAdmin(session: Session, ticketUserId: string): Promise<boolean> {
  return ticketUserId === session.userId || can(session.role, 'support:write:any')
}

const createTicketSchema = z.object({
  subject: z.string().trim().min(1, 'Enter a subject.'),
  body: z.string().trim().min(1, 'Describe what you need help with.'),
})

export async function createTicketAction(
  _prevState: SupportFormState,
  formData: FormData
): Promise<SupportFormState> {
  const limited = await limitFor('publicForm')
  if (!limited.ok) return { error: tooManyMessage(limited) }
  let session: Session
  try {
    session = requireSession(await getSession())
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = createTicketSchema.safeParse({
    subject: formData.get('subject'),
    body: formData.get('body'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  let ticketId: string
  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.userId,
        subject: parsed.data.subject,
        messages: { create: { senderId: session.userId, body: parsed.data.body } },
      },
    })
    ticketId = ticket.id
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The support database is not reachable right now.' }
    throw error
  }

  revalidatePath('/support')
  redirect(`/support/${ticketId}`)
}

const replySchema = z.object({
  ticketId: z.string().trim().min(1),
  body: z.string().trim().min(1, 'Enter a message.'),
})

export async function addMessageAction(
  _prevState: SupportFormState,
  formData: FormData
): Promise<SupportFormState> {
  let session: Session
  try {
    session = requireSession(await getSession())
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = replySchema.safeParse({
    ticketId: formData.get('ticketId'),
    body: formData.get('body'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a message.' }
  }

  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: parsed.data.ticketId } })
    if (!ticket || !(await ownerOrSupportAdmin(session, ticket.userId))) {
      return { error: 'Ticket not found.' }
    }

    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, senderId: session.userId, body: parsed.data.body },
    })

    // A reply from the ticket owner reopens it; nothing changes if an
    // agent is the one replying to an already-open ticket.
    if (ticket.userId === session.userId && ticket.status !== SupportStatus.OPEN) {
      await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: SupportStatus.OPEN } })
    }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The support database is not reachable right now.' }
    throw error
  }

  revalidatePath(`/support/${parsed.data.ticketId}`)
  return {}
}

const STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

const updateTicketSchema = z.object({
  ticketId: z.string().trim().min(1),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
})

export async function updateTicketAction(
  _prevState: SupportFormState,
  formData: FormData
): Promise<SupportFormState> {
  try {
    requirePermission(await getSession(), 'support:write:any')
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = updateTicketSchema.safeParse({
    ticketId: formData.get('ticketId'),
    status: formData.get('status'),
    priority: formData.get('priority'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  try {
    await prisma.supportTicket.update({
      where: { id: parsed.data.ticketId },
      data: { status: SupportStatus[parsed.data.status], priority: SupportPriority[parsed.data.priority] },
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'This ticket no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The support database is not reachable right now.' }
    throw error
  }

  revalidatePath(`/support/${parsed.data.ticketId}`)
  revalidatePath('/support/queue')
  return {}
}
