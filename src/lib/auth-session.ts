'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import { isConnected } from './integrations'
import { registerDoorlinkUser } from './register-user'
import { DEV_SESSION_COOKIE } from './session-cookie'
import { createSupabaseAdminClient } from './supabase/admin'
import { createSupabaseServerClient } from './supabase/server'
import {
  devRegisterAction,
  devSignInAction,
  devSignOutAction,
  type RegisterState,
  type SignInState,
} from './dev-session'

export type { RegisterState, SignInState }

const REGISTRABLE_ROLES = ['CUSTOMER', 'TECHNICIAN', 'SUPPLIER', 'MANUFACTURER'] as const

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: passwordSchema,
})

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    password: passwordSchema,
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

async function supabaseSignInAction(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    return { error: error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message }
  }

  try {
    const doorlinkUser = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (!doorlinkUser) {
      await supabase.auth.signOut()
      return {
        error:
          'This sign-in is valid in Supabase but there is no matching Doorlink account. Register first or contact support.',
      }
    }
  } catch (err) {
    if (isDatabaseUnreachable(err)) {
      await supabase.auth.signOut()
      return { error: 'The account database is not reachable right now.' }
    }
    throw err
  }

  redirect('/')
}

async function supabaseRegisterAction(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
    organizationName: formData.get('organizationName') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const { name, email, password, organizationName } = parsed.data
  const role = Role[parsed.data.role]

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return { error: 'An account with that email already exists.' }
  } catch (err) {
    if (isDatabaseUnreachable(err)) {
      return { error: 'The account database is not reachable right now.' }
    }
    throw err
  }

  const supabase = await createSupabaseServerClient()
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })
  if (signUpError) {
    return { error: signUpError.message }
  }

  const authUserId = signUpData.user?.id
  if (!authUserId) {
    return { error: 'Registration did not complete. Try again or check your email if confirmation is required.' }
  }

  try {
    await registerDoorlinkUser({ name, email, role, organizationName })
  } catch (err) {
    try {
      const admin = createSupabaseAdminClient()
      await admin.auth.admin.deleteUser(authUserId)
    } catch {
      // Best-effort rollback; surface the primary failure.
    }
    if (isDatabaseUnreachable(err)) {
      return { error: 'The account database is not reachable right now. Your auth user was removed — try again.' }
    }
    throw err
  }

  redirect('/welcome')
}

async function supabaseSignOutAction(_formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  const store = await cookies()
  store.delete(DEV_SESSION_COOKIE)
  redirect('/')
}

export async function signInAction(prev: SignInState, formData: FormData): Promise<SignInState> {
  if (isConnected('auth')) return supabaseSignInAction(prev, formData)
  return devSignInAction(prev, formData)
}

export async function registerAction(prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (isConnected('auth')) return supabaseRegisterAction(prev, formData)
  return devRegisterAction(prev, formData)
}

export async function signOutAction(formData: FormData): Promise<void> {
  if (isConnected('auth')) return supabaseSignOutAction(formData)
  return devSignOutAction(formData)
}
