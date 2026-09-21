import { isConnected } from './integrations'

// File storage behind one interface so the Supabase Storage adapter can
// replace the local one without any caller changing.
//
// A fileKey is a storage-relative path ("manuals/faac/e045-rev-c.pdf"),
// never a URL — resolving a key to something fetchable is this module's
// job, and only this module's. Callers that build their own URLs are how
// a storage migration turns into a hunt through the codebase.

export interface StoredFileRef {
  /** Storage-relative key, e.g. "manuals/faac/e045-732786-rev-c.pdf". */
  key: string
}

export type StorageBackend = 'local-public' | 'supabase'

export function activeStorageBackend(): StorageBackend {
  return isConnected('storage') ? 'supabase' : 'local-public'
}

// Files under the local backend live in public/ and are served directly
// by Next. That is fine for manufacturer manuals, which are public
// documents by nature — it would not be fine for anything private
// (verification documents, message attachments), which is why
// `isPubliclyServable` exists and callers for private files must check
// it rather than assuming every key can be linked to.
// Note what is NOT here: `manual-submissions/`. An uploaded manual that
// no administrator has approved is private, and `resolveFileUrl` returns
// null for it on the local backend as a result. The admin queue fetches
// those through a signed URL instead — see `signedFileUrl`.
const PUBLIC_PREFIXES = ['manuals/']

export function isPubliclyServable(key: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * Resolve a storage key to a URL the browser can fetch, or null when the
 * active backend cannot serve it — a private key on the local backend,
 * or any key while Supabase Storage is unconfigured. Callers render a
 * "not connected" state on null rather than linking to a 404.
 */
export function resolveFileUrl(key: string): string | null {
  if (activeStorageBackend() === 'supabase') {
    // doorlink-documents is a private bucket. A /object/public/ URL would
    // 403 and, worse, win over sourceUrl in manualAccess for records that
    // were never uploaded. Private keys use signedFileUrl; hosted library
    // manuals keep their publisher link until objects are deliberately public.
    return null
  }

  if (!isPubliclyServable(key)) return null
  return `/${key}`
}

/**
 * Store a file, or say why it could not be stored.
 *
 * Writing into public/ at runtime is still deliberately unimplemented:
 * it would work in dev and silently fail on any real deployment with a
 * read-only or ephemeral filesystem, which is exactly the kind of "works
 * on my machine" behaviour this codebase avoids. So the local backend
 * refuses, and the UI says uploads are unavailable.
 *
 * Against Supabase the upload is real. Note `upsert: false` — a key
 * collision is an error rather than a silent overwrite, because the keys
 * here are derived from record ids and a collision means something has
 * gone wrong upstream, not that the newer file should win.
 */
export async function uploadFile(input: {
  key: string
  body: Uint8Array
  contentType: string
}): Promise<StoredFileRef> {
  if (activeStorageBackend() !== 'supabase') {
    throw new StorageUnavailableError(
      'File upload needs Supabase Storage. Configure SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET.'
    )
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const bucket = process.env.SUPABASE_STORAGE_BUCKET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !bucket || !serviceKey) {
    throw new StorageUnavailableError('Supabase Storage is only partly configured.')
  }

  const endpoint = `${base.replace(/\/$/, '')}/storage/v1/object/${bucket}/${input.key}`
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': input.contentType,
        // The bucket may be public; an object under it need not be.
        // Private uploads (a submitted manual nobody has approved) must
        // not become fetchable the moment they land.
        'x-upsert': 'false',
        'cache-control': 'private, max-age=0, no-store',
      },
      body: Buffer.from(input.body),
    })
  } catch (error) {
    throw new StorageUnavailableError(
      `Could not reach Supabase Storage: ${error instanceof Error ? error.message : 'network error'}`
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new StorageUnavailableError(
      `Supabase Storage refused the upload (HTTP ${response.status}). ${detail}`.trim()
    )
  }

  return { key: input.key }
}

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageUnavailableError'
  }
}

export function canUpload(): boolean {
  return activeStorageBackend() === 'supabase'
}

/**
 * A short-lived URL for a file that is not public.
 *
 * Used for submitted manuals in the admin queue: a reviewer has to open
 * the document to judge it, and the alternative — making the object
 * public so the link works — would put every unapproved upload on the
 * open internet.
 *
 * Returns null when storage cannot mint one, so callers render an
 * honest "cannot preview" state rather than a dead link.
 */
export async function signedFileUrl(key: string, expiresInSeconds = 300): Promise<string | null> {
  if (activeStorageBackend() !== 'supabase') return null

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const bucket = process.env.SUPABASE_STORAGE_BUCKET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !bucket || !serviceKey) return null

  const root = base.replace(/\/$/, '')
  try {
    const response = await fetch(`${root}/storage/v1/object/sign/${bucket}/${key}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { signedURL?: string }
    return body.signedURL ? `${root}/storage/v1${body.signedURL}` : null
  } catch {
    return null
  }
}
