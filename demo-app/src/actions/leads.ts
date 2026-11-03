import { z } from 'zod'
import { formatMoney } from '@/lib/money'
import { getDemo, notify, update } from '../demo/store'
import { companyById } from '../demo/data'

/**
 * Demo stand-in for src/app/leads/actions.ts: a technician's quote on a
 * job-board request. Same fields and messages as the real action; the
 * quote lands on the customer's request in this browser only.
 */

export type QuoteFormState = { error?: string; ok?: boolean }

const quoteSchema = z.object({
  leadId: z.string().trim().min(1),
  amount: z.coerce.number().positive('Enter a quote amount greater than zero.'),
  message: z.string().trim().min(10, 'Tell the customer what your quote covers (at least 10 characters).'),
  estimatedDurationMinutes: z.coerce.number().int().positive().optional(),
  availableFrom: z.string().trim().optional(),
})

export async function submitQuoteAction(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const session = getDemo().session
  if (!session) return { error: 'Sign in to quote on jobs.' }
  if ((session.role !== 'TECHNICIAN' && session.role !== 'ADMIN') || !session.companyId) {
    return { error: 'Only technicians can quote on jobs.' }
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  const input = parsed.data

  const lead = getDemo().leads.find((l) => l.reference === input.leadId)
  if (!lead) return { error: 'Request not found.' }
  if (lead.status === 'Scheduled' || lead.status === 'Closed') return { error: 'This request is no longer accepting quotes.' }
  if (lead.customerId === session.userId) return { error: 'You cannot quote on your own request.' }

  const companyId = session.companyId
  update((s) => {
    const target = s.leads.find((l) => l.reference === input.leadId)!
    const response = {
      companyId,
      priceAUD: Math.round(input.amount * 100) / 100,
      message: input.message,
      at: new Date().toISOString(),
      durationMinutes: input.estimatedDurationMinutes ?? null,
      availableFrom: input.availableFrom ?? null,
    }
    const index = target.responses.findIndex((r) => r.companyId === companyId)
    if (index >= 0) target.responses[index] = response
    else target.responses.push(response)
    if (target.status === 'Open') target.status = 'Quoted'
  })
  if (lead.customerId) {
    notify(
      lead.customerId,
      'New quote on your request',
      `${companyById(companyId)?.name ?? 'A business'} quoted ${formatMoney(Math.round(input.amount * 100))} for “${lead.title}”.`,
      `/my-requests/${lead.reference}`
    )
  }
  return { ok: true }
}

export async function withdrawQuoteAction(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const session = getDemo().session
  if (!session?.companyId) return { error: 'Sign in to manage your quotes.' }
  const leadId = String(formData.get('leadId') ?? '')
  update((s) => {
    const target = s.leads.find((l) => l.reference === leadId)
    if (!target) return
    target.responses = target.responses.filter((r) => r.companyId !== session.companyId)
    if (target.responses.length === 0 && target.status === 'Quoted') target.status = 'Open'
  })
  return { ok: true }
}
