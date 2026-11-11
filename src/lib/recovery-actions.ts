'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { getSession } from '@/lib/auth'
import { isConnected } from '@/lib/integrations'
import { prisma } from '@/lib/prisma'
import { limitFor, tooManyMessage } from '@/lib/rate-limit'
import { withSupabaseServerClient } from '@/lib/supabase/server'

export type RecoveryState = { error?: string; sent?: boolean }

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Emails a reset link. The answer is the same whether or not the address
 * has an account, so the form can't be used to find out who's registered.
 */
export async function requestPasswordResetAction(_prev: RecoveryState, form: FormData): Promise<RecoveryState> {
  if (!isConnected('auth')) return { error: 'Password sign-in isn’t switched on for this site yet.' }
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Enter the email you sign in with.' }
  const byClient = await limitFor('passwordReset')
  if (!byClient.ok) return { error: tooManyMessage(byClient) }
  const byAccount = await limitFor('passwordReset', email)
  if (!byAccount.ok) return { sent: true }
  const known = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (known) {
    await withSupabaseServerClient((supabase) => supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/auth/confirm?next=/reset-password` })).catch((error) => {
      console.error('Password reset email failed', error)
    })
    await audit({ actorId: known.id, action: 'auth.password_reset.requested', entityType: 'User', entityId: known.id })
  }
  return { sent: true }
}

const passwordSchema = z
  .object({ password: z.string().min(10, 'Use at least 10 characters.').max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'The two passwords don’t match.', path: ['confirm'] })

/** Sets a new password for the person signed in through the reset link. */
export async function setNewPasswordAction(_prev: RecoveryState, form: FormData): Promise<RecoveryState> {
  if (!isConnected('auth')) return { error: 'Password sign-in isn’t switched on for this site yet.' }
  const session = await getSession()
  if (!session) return { error: 'This reset link has expired. Ask for a new one.' }
  const parsed = passwordSchema.safeParse({ password: form.get('password'), confirm: form.get('confirm') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the password.' }
  const { error } = await withSupabaseServerClient((supabase) => supabase.auth.updateUser({ password: parsed.data.password }))
  if (error) return { error: error.message }
  await audit({ actorId: session.userId, action: 'auth.password_reset.completed', entityType: 'User', entityId: session.userId })
  redirect('/account?password=changed')
}
