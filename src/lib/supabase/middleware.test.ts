import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServerClient, getSession } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient }))
import { updateSession } from './middleware'

describe('session refresh on navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-only')
    createServerClient.mockReturnValue({ auth: { getSession } })
    getSession.mockResolvedValue({ data: { session: null } })
  })

  it('does not contact auth for anonymous requests', async () => {
    await updateSession(new NextRequest('https://example.test/configure'))
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('refreshes chunked cookies without a duplicate user lookup in middleware', async () => {
    await updateSession(new NextRequest('https://example.test/configure', {
      headers: { cookie: 'sb-project-auth-token.0=untrusted' },
    }))
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('does not treat a PKCE verifier as a signed-in session', async () => {
    await updateSession(new NextRequest('https://example.test/configure', {
      headers: { cookie: 'sb-project-auth-token-code-verifier=untrusted' },
    }))
    expect(createServerClient).not.toHaveBeenCalled()
  })
})
