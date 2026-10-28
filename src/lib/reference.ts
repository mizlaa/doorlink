import { randomBytes } from 'crypto'

// Human-readable references for the things people phone up about — a
// lead, a job, a payment. Deliberately not the cuid primary key: a
// customer reading "DL-JOB-7F3K2QX" down the phone to a technician is a
// real workflow, and reading a 25-character cuid is not.
//
// Crockford base32 (no I, L, O, U) so the characters that get misheard
// or mistyped never appear in the first place.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomCode(length: number): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}

export type ReferenceKind =
  | 'LEAD'
  | 'JOB'
  | 'TXN'
  | 'PAYOUT'
  | 'CFG'
  | 'INSP'
  | 'ASSET'
  | 'MAN'
  | 'SPR'
  | 'QTE'

export function makeReference(kind: ReferenceKind, length = 7): string {
  return `DL-${kind}-${randomCode(length)}`
}
