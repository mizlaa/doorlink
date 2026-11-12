'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { BUSINESS_COOKIE, businessContexts } from '@/lib/business/access'

/** Switches which business this person is working in. Only businesses they belong to are accepted. */
export async function switchBusinessAction(form: FormData): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/business')
  const id = String(form.get('businessId') ?? '')
  const contexts = await businessContexts(session)
  const target = contexts.find((c) => c.businessId === id)
  if (target) {
    ;(await cookies()).set(BUSINESS_COOKIE, target.businessId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 180 })
  }
  const back = String(form.get('back') ?? '/business')
  redirect(back.startsWith('/business') || back === '/today' ? back : '/business')
}
