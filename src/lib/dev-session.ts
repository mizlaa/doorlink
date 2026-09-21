'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import { registerDoorlinkUser } from './register-user'
import { DEV_SESSION_COOKIE } from './session-cookie'

// Everything in this file is the dev-only stand-in for real authentication:
// no passwords, a plain cookie, and it refuses to run in production (see
// DevCookieSessionProvider in auth.ts, which reads what this writes). When
// a real provider (Supabase) is wired in, this whole file gets replaced —
// nothing here is part of the provider-agnostic SessionProvider interface.

export type SignInState = { error?: string }
export type RegisterState = { error?: string }

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
})

export async function devSignInAction(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  if (process.env.NODE_ENV === 'production') {
    return { error: 'Sign-in is not available in production yet — no authentication provider is connected.' }
  }

  const parsed = signInSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email address.' }
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (!user) return { error: 'No account found with that email.' }

    const store = await cookies()
    store.set(DEV_SESSION_COOKIE, user.email, { httpOnly: true, sameSite: 'lax', path: '/' })
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      return { error: 'The account database is not reachable right now.' }
    }
    throw error
  }

  redirect('/')
}

const REGISTRABLE_ROLES = ['CUSTOMER', 'TECHNICIAN', 'SUPPLIER', 'MANUFACTURER'] as const

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    role: z.enum(REGISTRABLE_ROLES),
    organizationName: z.string().trim().optional(),
  })
  .refine(
    (data) => (data.role === 'SUPPLIER' || data.role === 'MANUFACTURER' ? !!data.organizationName : true),
    {
      message: 'Enter your organization name.',
      path: ['organizationName'],
    }
  )

export async function devRegisterAction(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  if (process.env.NODE_ENV === 'production') {
    return {
      error: 'Registration is not available in production yet — no authentication provider is connected.',
    }
  }

  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
    organizationName: formData.get('organizationName') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const { name, email, organizationName } = parsed.data
  const role = Role[parsed.data.role]

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return { error: 'An account with that email already exists.' }

    const user = await registerDoorlinkUser({ name, email, role, organizationName })

    const store = await cookies()
    store.set(DEV_SESSION_COOKIE, user.email, { httpOnly: true, sameSite: 'lax', path: '/' })
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      return { error: 'The account database is not reachable right now.' }
    }
    throw error
  }

  // A new account lands on the checklist rather than the home page. What
  // it shows is counted from the account, so this is not a wizard that has
  // to be finished — leaving it does not strand anything half-created.
  redirect('/welcome')
}

export async function devSignOutAction(_formData: FormData): Promise<void> {
  const store = await cookies()
  store.delete(DEV_SESSION_COOKIE)
  redirect('/')
}
