import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, codeAt, decryptSecret, encryptSecret, hashRecoveryCode, newRecoveryCodes, newSecret, stepAt, verifyCode } from './totp'

// RFC 6238 appendix B, SHA-1 key "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(codeAt(RFC_SECRET, stepAt(59_000), 8)).toBe('94287082')
    expect(codeAt(RFC_SECRET, stepAt(1_111_111_109_000), 8)).toBe('07081804')
    expect(codeAt(RFC_SECRET, stepAt(1_234_567_890_000), 8)).toBe('89005924')
    expect(codeAt(RFC_SECRET, stepAt(20_000_000_000_000), 8)).toBe('65353130')
  })

  it('round-trips base32', () => {
    const secret = newSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Encode(base32Decode(secret))).toBe(secret)
  })

  it('accepts the current code and one step either side, nothing further', () => {
    const secret = newSecret()
    const now = 1_800_000_000_000
    const step = stepAt(now)
    expect(verifyCode(secret, codeAt(secret, step), null, now)).toBe(step)
    expect(verifyCode(secret, codeAt(secret, step - 1), null, now)).toBe(step - 1)
    expect(verifyCode(secret, codeAt(secret, step + 1), null, now)).toBe(step + 1)
    expect(verifyCode(secret, codeAt(secret, step - 2), null, now)).toBeNull()
    expect(verifyCode(secret, 'abcdef', null, now)).toBeNull()
  })

  it('never accepts the same code twice', () => {
    const secret = newSecret()
    const now = 1_800_000_000_000
    const step = verifyCode(secret, codeAt(secret, stepAt(now)), null, now)!
    expect(verifyCode(secret, codeAt(secret, stepAt(now)), step, now)).toBeNull()
  })

  it('encrypts secrets at rest and detects tampering', () => {
    const secret = newSecret()
    const stored = encryptSecret(secret)
    expect(stored).not.toContain(secret)
    expect(decryptSecret(stored)).toBe(secret)
    const [iv, tag, body] = stored.split('.')
    expect(() => decryptSecret([iv, tag, body.slice(0, -2) + (body.endsWith('A') ? 'B' : 'A')].join('.'))).toThrow()
  })

  it('makes distinct recovery codes and hashes them case-insensitively', () => {
    const codes = newRecoveryCodes()
    expect(new Set(codes).size).toBe(10)
    expect(codes[0]).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/)
    expect(hashRecoveryCode(codes[0].toLowerCase().replace('-', ' '))).toBe(hashRecoveryCode(codes[0]))
  })
})
