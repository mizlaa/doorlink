import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Role } from '@prisma/client'
import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import { isConnected } from './integrations'
import { DEV_SESSION_COOKIE } from './session-cookie'
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

interface SessionProvider {
  getSession(): Promise<Session | null>
}

async function doorlinkSessionFromEmail(email: string): Promise<Session | null> {
  let user
  try {
    user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
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
  }
}

// Reads a plain email out of a cookie and loads the matching demo user.
// Sets no passwords and refuses to run in production, so it can never
// stand in for real authentication once deployed.
class DevCookieSessionProvider implements SessionProvider {
  async getSession(): Promise<Session | null> {
    if (process.env.NODE_ENV === 'production') return null

    const store = await cookies()
    const email = store.get(DEV_SESSION_COOKIE)?.value
    if (!email) return null

    return doorlinkSessionFromEmail(email)
  }
}

class SupabaseSessionProvider implements SessionProvider {
  async getSession(): Promise<Session | null> {
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
export const getSession = cache(async (): Promise<Session | null> => {
  return activeSessionProvider().getSession()
})
