import { describe, expect, it } from 'vitest'
import { hasSupabaseSessionCookie } from './session-cookie'

describe('Supabase session cookie detection', () => {
  it('does not verify anonymous or unrelated cookies', () => {
    expect(hasSupabaseSessionCookie([])).toBe(false)
    expect(hasSupabaseSessionCookie([{ name: 'analytics', value: 'present' }])).toBe(false)
    expect(hasSupabaseSessionCookie([{ name: 'sb-project-auth-token-code-verifier', value: 'present' }])).toBe(false)
  })

  it('verifies both whole and chunked session cookies', () => {
    expect(hasSupabaseSessionCookie([{ name: 'sb-project-auth-token', value: 'untrusted' }])).toBe(true)
    expect(hasSupabaseSessionCookie([{ name: 'sb-project-auth-token.0', value: 'untrusted' }])).toBe(true)
    expect(hasSupabaseSessionCookie([{ name: 'sb-project-auth-token.1', value: 'untrusted' }])).toBe(true)
  })

  it('does not treat an empty or malformed cookie as a session', () => {
    expect(hasSupabaseSessionCookie([{ name: 'sb-project-auth-token', value: '' }])).toBe(false)
    expect(hasSupabaseSessionCookie([{ name: 'sb-project-auth-token.backup', value: 'untrusted' }])).toBe(false)
  })
})
