import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Role } from '@prisma/client'
import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import { isConnected } from './integrations'
import { DEV_SESSION_COOKIE, MFA_COOKIE } from './session-cookie'
import { mfaCookieValid } from './mfa/cookie'
import { withSupabaseServerClient } from './supabase/server'
import { AuthServiceUnavailableError } from './supabase/auth-service'
import { hasSupabaseSessionCookie } from './supabase/session-cookie'

export type Session = {
  userId: string
  email: string
  name: string
  role: Role
  organizationId: string | null
}

/** A signed-in account, with whether it has two-step sign-in turned on. */
type RawSession = Session & { mfaEnrolled: boolean }

interface SessionProvider {
  getSession(): Promise<RawSession | null>
}

async function doorlinkSessionFromEmail(email: string): Promise<RawSession | null> {
  let user
  try {
    user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: true, mfaCredential: { select: { confirmedAt: true } } },
    })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return null
    throw error
  }
  if (!user) return null

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.memberships[0]?.organizationId ?? null,
    mfaEnrolled: !!user.mfaCredential?.confirmedAt,
  }
}

// Reads a plain email out of a cookie and loads the matching demo user.
// Sets no passwords and refuses to run in production, so it can never
// stand in for real authentication once deployed.
class DevCookieSessionProvider implements SessionProvider {
  async getSession(): Promise<RawSession | null> {
    if (process.env.NODE_ENV === 'production') return null

    const store = await cookies()
    const email = store.get(DEV_SESSION_COOKIE)?.value
    if (!email) return null

    return doorlinkSessionFromEmail(email)
  }
}

class SupabaseSessionProvider implements SessionProvider {
  async getSession(): Promise<RawSession | null> {
    const store = await cookies()
    if (!hasSupabaseSessionCookie(store.getAll())) return null
    let user
    try {
      const result = await withSupabaseServerClient((supabase) => supabase.auth.getUser())
      user = result.data.user
    } catch (error) {
      if (error instanceof AuthServiceUnavailableError) return null
      throw error
    }
    if (!user?.email) return null

    return doorlinkSessionFromEmail(user.email)
  }
}

function activeSessionProvider(): SessionProvider {
  if (isConnected('auth')) return new SupabaseSessionProvider()
  return new DevCookieSessionProvider()
}

// The one place a real provider (Supabase) gets swapped in — every route
// and component below only ever calls getSession().
// React's cache is scoped to a server render/request, never shared across users.
// The header, mobile navigation and page must not repeat auth and user queries.
const rawSession = cache(async (): Promise<RawSession | null> => activeSessionProvider().getSession())

/**
 * The signed-in person, or null. An account with two-step sign-in turned
 * on counts as signed out until this browser has entered a code, so every
 * page, action and API route that calls this enforces it.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const raw = await rawSession()
  if (!raw) return null
  const { mfaEnrolled, ...session } = raw
  if (mfaEnrolled && !mfaCookieValid((await cookies()).get(MFA_COOKIE)?.value, session.userId)) return null
  return session
})

/** Someone who has signed in but still owes their second step. Only the two-step screen uses this. */
export const getPendingMfaSession = cache(async (): Promise<Session | null> => {
  const raw = await rawSession()
  if (!raw?.mfaEnrolled) return null
  const { mfaEnrolled: _enrolled, ...session } = raw
  void _enrolled
  return mfaCookieValid((await cookies()).get(MFA_COOKIE)?.value, session.userId) ? null : session
})
