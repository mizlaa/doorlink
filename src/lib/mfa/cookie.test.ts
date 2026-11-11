import { describe, expect, it } from 'vitest'
import { MFA_TTL_MS, mfaCookieValid, mfaCookieValue } from './cookie'

describe('two-step cookie', () => {
  it('is valid only for its own account and only until it expires', () => {
    const now = 1_800_000_000_000
    const value = mfaCookieValue('user-a', now)
    expect(mfaCookieValid(value, 'user-a', now + 1000)).toBe(true)
    expect(mfaCookieValid(value, 'user-b', now + 1000)).toBe(false)
    expect(mfaCookieValid(value, 'user-a', now + MFA_TTL_MS + 1)).toBe(false)
  })
  it('rejects a forged or edited value', () => {
    const now = 1_800_000_000_000
    const [id, expires] = mfaCookieValue('user-a', now).split('.')
    expect(mfaCookieValid(`${id}.${Number(expires) + 9_999_999}.forged`, 'user-a', now)).toBe(false)
    expect(mfaCookieValid(undefined, 'user-a', now)).toBe(false)
  })
})
