import { parseMoney } from '@/lib/pricing/validation'
import { navigate } from '../router'
import { getDemo } from '../demo/store'
import {
  acceptAndPay,
  confirmBooking,
  declineBooking,
  jobById,
  payBalance,
  photosFrom,
  postUpdate,
  companyActorName,
} from '../demo/flows'

export type FlowState = { error?: string; ok?: boolean }

function actorFor(jobId: string): { actor: 'customer' | 'worker' | 'admin'; name: string } | null {
  const s = getDemo()
  const job = jobById(jobId)
  if (!job || !s.session) return null
  if (job.customerId === s.session.userId) return { actor: 'customer', name: s.session.name }
  if (s.session.companyId === job.companyId) return { actor: 'worker', name: companyActorName(job.companyId) }
  if (s.session.role === 'ADMIN') return { actor: 'admin', name: s.session.name }
  return null
}

export async function confirmBookingAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const jobId = String(formData.get('jobId') ?? '')
  const who = actorFor(jobId)
  const job = jobById(jobId)
  if (!who || who.actor === 'customer' || !job) return { error: 'Job not found.' }
  if (job.status !== 'REQUESTED') return { error: 'This booking has already been answered.' }
  let final: number | null = null
  if (job.priceType === 'ESTIMATE') {
    final = parseMoney(String(formData.get('finalPrice') ?? ''))
    if (final === null || final <= 0) return { error: 'Enter the final price in dollars, including GST.' }
  }
  const note = String(formData.get('note') ?? '').trim() || null
  confirmBooking(jobId, who.name, final, note)
  return { ok: true }
}

export async function declineBookingAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const jobId = String(formData.get('jobId') ?? '')
  const who = actorFor(jobId)
  if (!who || who.actor === 'customer') return { error: 'Job not found.' }
  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason) return { error: 'Tell the customer why, briefly.' }
  declineBooking(jobId, who.name, reason)
  return { ok: true }
}

export async function acceptAndPayAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const jobId = String(formData.get('jobId') ?? '')
  const who = actorFor(jobId)
  const job = jobById(jobId)
  if (!who || who.actor !== 'customer' || !job) return { error: 'Job not found.' }
  if (job.status !== 'AWAITING_PAYMENT') return { error: 'This job isn’t waiting on payment.' }
  if (formData.get('accept') !== 'on') return { error: 'Tick the box to accept the final price and terms.' }
  await new Promise((r) => setTimeout(r, 700))
  acceptAndPay(jobId, who.name)
  navigate(`/jobs/${jobId}?paid=1&demo=1`)
  return { ok: true }
}

export async function payBalanceAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const jobId = String(formData.get('jobId') ?? '')
  const who = actorFor(jobId)
  if (!who || who.actor !== 'customer') return { error: 'Job not found.' }
  await new Promise((r) => setTimeout(r, 600))
  payBalance(jobId, who.name)
  navigate(`/jobs/${jobId}?paid=1&demo=1`)
  return { ok: true }
}

export async function postJobUpdateAction(_prev: FlowState, formData: FormData): Promise<FlowState> {
  const jobId = String(formData.get('jobId') ?? '')
  const who = actorFor(jobId)
  if (!who || who.actor === 'customer') return { error: 'Job not found.' }
  const note = String(formData.get('note') ?? '').trim()
  const photos = await photosFrom(formData)
  if (!note && photos.length === 0) return { error: 'Write a note or add a photo.' }
  postUpdate(jobId, who.name, note, photos)
  return { ok: true }
}
