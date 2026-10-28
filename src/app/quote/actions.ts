'use server'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { requestFromForm } from '@/lib/quoting/forms'
import { requestQuotes, type RequestQuotesResult } from '@/lib/quoting/quotes'

export type QuoteFormState = { errors?: Record<string, string | undefined> }

export async function requestQuotesAction(_prev: QuoteFormState, form: FormData): Promise<QuoteFormState> {
  let design: unknown = null
  try {
    design = JSON.parse(String(form.get('design') ?? 'null'))
  } catch {
    design = null
  }
  let result: RequestQuotesResult
  try {
    result = await requestQuotes(await getSession(), {
      request: requestFromForm(form),
      design,
      organizationIds: form.getAll('company').map(String),
      shareContact: form.get('shareContact') === 'on',
    })
  } catch (error) {
    if (error instanceof RbacError) return { errors: { form: error.status === 401 ? 'Sign in to get quotes.' : 'Your account cannot request quotes.' } }
    if (isDatabaseUnreachable(error)) return { errors: { form: "Can't reach the database right now. Try again in a moment." } }
    throw error
  }
  if (!result.ok) return { errors: result.errors }
  redirect(`/quotes/${result.requestId}${result.skipped ? `?skipped=${result.skipped}` : ''}`)
}
