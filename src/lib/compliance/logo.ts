/**
 * Logo handling.
 *
 * The logo is stored as a data URI on the profile row rather than as an
 * uploaded file, because no file-storage backend is connected and a
 * logo is small enough that this is a reasonable permanent answer rather
 * than a stand-in. If Supabase Storage is connected later, this becomes
 * a storage key and the only caller that changes is the form.
 *
 * Everything here is validated on the server before it is written. A
 * data URI is user-supplied text that ends up inside an `<img src>` on a
 * document the buyer sends to their clients, so the type allow-list is a
 * trust boundary, not a convenience: `image/svg+xml` is deliberately
 * absent, because an SVG can carry script.
 */

export const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type AllowedLogoType = (typeof ALLOWED_LOGO_TYPES)[number]

/**
 * 512 KB of decoded image. Large enough for a print-resolution logo,
 * small enough that fifteen documents embedding it stay manageable.
 */
export const MAX_LOGO_BYTES = 512 * 1024

/** Base64 inflates by about 4/3; the cap on the encoded string. */
export const MAX_LOGO_DATA_URI_LENGTH = Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 100

const DATA_URI_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/

export interface LogoCheck {
  ok: boolean
  /** Why it was refused, as a sentence for the person who uploaded it. */
  error: string | null
  type: AllowedLogoType | null
  bytes: number | null
}

export function checkLogoDataUri(value: string): LogoCheck {
  const trimmed = value.trim()

  if (!trimmed) {
    return { ok: false, error: 'No image was supplied.', type: null, bytes: null }
  }

  if (trimmed.length > MAX_LOGO_DATA_URI_LENGTH) {
    return {
      ok: false,
      error: `That image is too large. The limit is ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`,
      type: null,
      bytes: null,
    }
  }

  const match = DATA_URI_PATTERN.exec(trimmed)
  if (!match) {
    return {
      ok: false,
      // Named explicitly, because "invalid image" sends someone hunting
      // for a corrupt file when the real answer is that they picked an
      // SVG or a PDF.
      error: 'Use a PNG, JPEG or WebP image. SVG and PDF files are not accepted.',
      type: null,
      bytes: null,
    }
  }

  const [, type, base64] = match

  // Decoded length from the encoded length, without decoding it.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const bytes = Math.floor((base64.length * 3) / 4) - padding

  if (bytes > MAX_LOGO_BYTES) {
    return {
      ok: false,
      error: `That image is ${Math.round(bytes / 1024)} KB. The limit is ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`,
      type: null,
      bytes,
    }
  }

  if (bytes === 0) {
    return { ok: false, error: 'That image is empty.', type: null, bytes: 0 }
  }

  return { ok: true, error: null, type: type as AllowedLogoType, bytes }
}
