'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { limitFor, tooManyMessage } from '@/lib/rate-limit'
import { can } from '@/lib/rbac'
import { cancelMeasureRequest, createMeasureRequest, readMeasureForm } from '@/lib/requests/measure'

export type MeasureState = { error?: string }

/**
 * "Request On-Site Measure". Free, for customer accounts. The design and
 * the address are sent once; a second tap or a retry with the same form
 * makes no second request.
 */
export async function requestMeasureAction(_prev: MeasureState, formData: FormData): Promise<MeasureState> {
  const session = await getSession()
  if (!session) return { error: 'Sign in to send your request.' }
  if (!can(session.role, 'quote:request')) return { error: 'Measure requests are for customer accounts.' }

  const form = readMeasureForm(formData)
  if (!form.ok) return { error: form.error }

  const limited = await limitFor('measureRequest', session.userId)
  if (!limited.ok) return { error: tooManyMessage(limited) }

  let reference: string
  try {
    reference = (await createMeasureRequest(session.userId, form.data)).reference
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now. Your request was not sent.' }
    throw error
  }
  redirect(`/measure/${reference}?sent=1`)
}

export async function cancelMeasureAction(formData: FormData): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  const reference = String(formData.get('reference') ?? '')
  await cancelMeasureRequest(session.userId, reference)
  revalidatePath(`/measure/${reference}`)
}
