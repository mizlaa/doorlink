import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Time-based one-time passwords (RFC 6238, the codes authenticator apps
 * show): 6 digits, 30-second steps, SHA-1. Written out here rather than
 * pulled from a package so the whole thing can be read and tested.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const STEP_SECONDS = 30

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch)
    if (index < 0) throw new Error('not base32')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function newSecret(): string {
  return base32Encode(randomBytes(20))
}

export function codeAt(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', Buffer.from(base32Decode(secret))).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  const binary = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, '0')
}

export function stepAt(time: number): number {
  return Math.floor(time / 1000 / STEP_SECONDS)
}

/**
 * Checks a code against the current step and one either side (phone clocks
 * drift). Returns the step it matched so the caller can refuse it next
 * time; a step at or before `lastUsedStep` is never accepted again.
 */
export function verifyCode(secret: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  const digits = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return null
  const current = stepAt(now)
  for (const step of [current, current - 1, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue
    const expected = Buffer.from(codeAt(secret, step))
    if (timingSafeEqual(expected, Buffer.from(digits))) return step
  }
  return null
}

export function otpauthUri(secret: string, account: string, issuer = 'Doorlink'): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`
}

// ------------------------------------------------- secrets at rest

function key(): Buffer {
  const secret = process.env.MFA_ENCRYPTION_KEY || process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('Set MFA_ENCRYPTION_KEY (or AUTH_SECRET) before turning on two-step sign-in.')
    return createHash('sha256').update('doorlink-development-only').digest()
  }
  return createHash('sha256').update(`mfa:${secret}`).digest()
}

/** AES-256-GCM, so a database copy alone doesn't reveal anyone's authenticator secret. */
export function encryptSecret(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

export function decryptSecret(stored: string): string {
  const [iv, tag, body] = stored.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

// ------------------------------------------------- recovery codes

/** Ten single-use codes like "K7QX2-MP4RD", shown once. */
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10)
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

export function hashRecoveryCode(code: string): string {
  const normalised = code.toUpperCase().replace(/[^A-Z2-7]/g, '')
  return createHash('sha256').update(`recovery:${process.env.AUTH_SECRET ?? ''}:${normalised}`).digest('hex')
}
