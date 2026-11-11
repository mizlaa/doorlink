import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Proof that this browser finished two-step sign-in for one account:
 * "<userId>.<expiry>.<signature>". Signed with the server's secret, so it
 * can't be made or moved to another account; it expires after 12 hours.
 */
export const MFA_TTL_MS = 12 * 3_600_000

function secret(): string {
  const value = process.env.AUTH_SECRET
  if (!value) {
    if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set.')
    return 'doorlink-development-only'
  }
  return value
}

const sign = (userId: string, expires: number) => createHmac('sha256', secret()).update(`mfa:${userId}:${expires}`).digest('base64url')

export function mfaCookieValue(userId: string, now = Date.now()): string {
  const expires = now + MFA_TTL_MS
  return `${userId}.${expires}.${sign(userId, expires)}`
}

export function mfaCookieValid(value: string | undefined, userId: string, now = Date.now()): boolean {
  if (!value) return false
  const [id, expiresText, signature] = value.split('.')
  const expires = Number(expiresText)
  if (id !== userId || !Number.isFinite(expires) || expires < now || !signature) return false
  const expected = Buffer.from(sign(userId, expires))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
