'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { LeadStatus, NotificationType, QuoteStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession, type Session } from '@/lib/auth'
import { can, requireSession, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import { isQuotable } from '@/lib/marketplace'
import { formatMoney, toMinorUnits } from '@/lib/money'
import { notify } from '@/lib/notifications'
import { requireTradeSubscription, isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'

export type QuoteFormState = { error?: string; ok?: boolean }

async function requireQuoter(): Promise<Session> {
  const session = requireSession(await getSession())
  if (!can(session.role, 'marketplace:quote')) {
    throw new RbacError('Only technicians can quote on jobs.', 403)
  }
  await requireTradeSubscription(session)
  return session
}

const quoteSchema = z.object({
  leadId: z.string().trim().min(1),
  amount: z.coerce.number().positive('Enter a quote amount greater than zero.'),
  message: z.string().trim().min(10, 'Tell the customer what your quote covers (at least 10 characters).'),
  estimatedDurationMinutes: z.coerce.number().int().positive().optional(),
  availableFrom: z.string().trim().optional(),
})

export async function submitQuoteAction(
  _prevState: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  let session: Session
  try {
    session = await requireQuoter()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    if (isTradeSubscriptionRequiredError(error)) return { error: error.message }
    throw error
  }

  const rawDuration = String(formData.get('estimatedDurationMinutes') ?? '').trim()
  const rawAvailable = String(formData.get('availableFrom') ?? '').trim()

  const parsed = quoteSchema.safeParse({
    leadId: formData.get('leadId'),
    amount: formData.get('amount'),
    message: formData.get('message'),
    estimatedDurationMinutes: rawDuration.length > 0 ? rawDuration : undefined,
    availableFrom: rawAvailable.length > 0 ? rawAvailable : undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  try {
    const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } })
    if (!lead) return { error: 'Request not found.' }
    if (!isQuotable(lead.status)) return { error: 'This request is no longer accepting quotes.' }
    if (lead.customerId && lead.customerId === session.userId) {
      return { error: 'You cannot quote on your own request.' }
    }

    // One quote per worker per lead, enforced by a unique constraint in
    // the schema. Re-submitting updates the existing quote rather than
    // erroring — a technician revising their price is normal, and
    // stacking duplicates would make the customer's comparison useless.
    await prisma.quote.upsert({
      where: { leadId_workerId: { leadId: lead.id, workerId: session.userId } },
      update: {
        amountCents: toMinorUnits(parsed.data.amount),
        message: parsed.data.message,
        estimatedDurationMinutes: parsed.data.estimatedDurationMinutes ?? null,
        availableFrom: parsed.data.availableFrom ? new Date(parsed.data.availableFrom) : null,
        status: QuoteStatus.PENDING,
      },
      create: {
        leadId: lead.id,
        workerId: session.userId,
        amountCents: toMinorUnits(parsed.data.amount),
        message: parsed.data.message,
        estimatedDurationMinutes: parsed.data.estimatedDurationMinutes ?? null,
        availableFrom: parsed.data.availableFrom ? new Date(parsed.data.availableFrom) : null,
      },
    })

    if (lead.status === LeadStatus.NEW || lead.status === LeadStatus.OPEN_FOR_QUOTES) {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.QUOTED } })
    }

    // A quote the customer is never told about is a quote that does not
    // get compared. Notifying is best-effort — see notify() — so it can
    // never be the reason a sent quote is lost.
    if (lead.customerId) {
      await notify({
        userId: lead.customerId,
        type: NotificationType.QUOTE_RECEIVED,
        title: 'New quote on your request',
        body: `${session.name} quoted ${formatMoney(toMinorUnits(parsed.data.amount))} on "${lead.title ?? lead.reference}".`,
        href: `/my-requests/${lead.id}`,
      })
    }
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'Request not found.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath('/leads')
  return { ok: true }
}

export async function withdrawQuoteAction(
  _prevState: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  let session: Session
  try {
    session = await requireQuoter()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    if (isTradeSubscriptionRequiredError(error)) return { error: error.message }
    throw error
  }

  const quoteId = String(formData.get('quoteId') ?? '')
  if (!quoteId) return { error: 'Missing quote.' }

  try {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId } })
    // Ownership re-checked here regardless of which page rendered the
    // form, and a mismatch reports "not found" rather than "forbidden"
    // so it leaks nothing about other people's quotes.
    if (!quote || quote.workerId !== session.userId) return { error: 'Quote not found.' }
    if (quote.status !== QuoteStatus.PENDING) return { error: 'That quote can no longer be withdrawn.' }

    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.WITHDRAWN, respondedAt: new Date() },
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'Quote not found.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath('/leads')
  return { ok: true }
}
