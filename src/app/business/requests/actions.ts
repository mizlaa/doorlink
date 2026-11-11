'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { businessAction } from '@/lib/business/guard'
import { acceptMeasureRequest, declineMeasureRequest, RequestError } from '@/lib/requests/measure'

export type RequestActionState = { error?: string }

export async function acceptRequestAction(_prev: RequestActionState, formData: FormData): Promise<RequestActionState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  let jobId: string
  try {
    jobId = (await acceptMeasureRequest(gate.business, String(formData.get('requestId') ?? ''), gate.session.userId)).jobId
  } catch (error) {
    if (error instanceof RequestError) {
      revalidatePath('/business/requests')
      return { error: error.message }
    }
    throw error
  }
  revalidatePath('/business/requests')
  // Straight to booking the visit: accepting and scheduling are one thought.
  redirect(`/business/calendar/new?job=${jobId}&accepted=1`)
}

export async function declineRequestAction(_prev: RequestActionState, formData: FormData): Promise<RequestActionState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  try {
    await declineMeasureRequest(gate.business, String(formData.get('requestId') ?? ''), String(formData.get('reason') ?? '').trim().slice(0, 300) || null)
  } catch (error) {
    if (error instanceof RequestError) return { error: error.message }
    throw error
  }
  revalidatePath('/business/requests')
  return {}
}
