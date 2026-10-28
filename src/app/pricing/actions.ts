'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'
import { createOwnBusiness, deleteOwnRule, QuotingError, requireCompanyContext, saveOwnProfile, saveOwnRule, setOwnRuleActive } from '@/lib/quoting/company'
import { ruleFromForm } from '@/lib/quoting/forms'
import type { RuleErrors } from '@/lib/quoting/pricing'

export type FormState = { error?: string; errors?: Record<string, string | undefined>; saved?: boolean }

/** The messages a person can act on. Anything else is a real fault and is rethrown. */
function known(error: unknown): string | null {
  if (error instanceof RbacError || error instanceof QuotingError) return error.message
  if (isTradeSubscriptionRequiredError(error)) return 'An active Doorlink trade subscription is required to manage automated pricing.'
  if (isDatabaseUnreachable(error)) return "Can't reach the database right now. Try again in a moment."
  return null
}

export async function createBusinessAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await createOwnBusiness(await getSession(), String(form.get('name') ?? ''))
  } catch (error) {
    const message = known(error)
    if (message) return { error: message }
    throw error
  }
  revalidatePath('/pricing')
  return { saved: true }
}

export async function saveProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const ctx = await requireCompanyContext(await getSession())
    const str = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : null)
    const result = await saveOwnProfile(ctx, {
      about: str('about'), serviceArea: str('serviceArea'), phone: str('phone'), website: str('website'), abn: str('abn'),
      quotingEnabled: form.get('quotingEnabled') === 'on',
    })
    if (!result.ok) return { errors: result.errors }
  } catch (error) {
    const message = known(error)
    if (message) return { error: message }
    throw error
  }
  revalidatePath('/pricing')
  return { saved: true }
}

export async function saveRuleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = typeof form.get('id') === 'string' && form.get('id') ? String(form.get('id')) : undefined
  let errors: RuleErrors | undefined
  try {
    const ctx = await requireCompanyContext(await getSession())
    const result = await saveOwnRule(ctx, ruleFromForm(form), id)
    if (!result.ok) errors = result.errors
  } catch (error) {
    const message = known(error)
    if (message) return { error: message }
    throw error
  }
  if (errors) return { errors }
  revalidatePath('/pricing')
  redirect('/pricing?saved=rule')
}

export async function toggleRuleAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '')
  let problem: string | null = null
  try {
    const ctx = await requireCompanyContext(await getSession())
    const result = await setOwnRuleActive(ctx, id, form.get('active') === 'true')
    if (!result.ok) problem = result.errors.overlap ?? 'That rule could not be switched on.'
  } catch (error) {
    problem = known(error)
    if (!problem) throw error
  }
  revalidatePath('/pricing')
  redirect(problem ? `/pricing?problem=${encodeURIComponent(problem)}` : '/pricing')
}

export async function deleteRuleAction(form: FormData): Promise<void> {
  let problem: string | null = null
  try {
    const ctx = await requireCompanyContext(await getSession())
    await deleteOwnRule(ctx, String(form.get('id') ?? ''))
  } catch (error) {
    problem = known(error)
    if (!problem) throw error
  }
  revalidatePath('/pricing')
  redirect(problem ? `/pricing?problem=${encodeURIComponent(problem)}` : '/pricing?saved=deleted')
}
