import 'server-only'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { activeStorageBackend, signedFileUrl, StorageUnavailableError, uploadFile } from './storage'

/**
 * Images people add: business logos and portfolios, job progress photos,
 * review photos and AI design images.
 *
 * Production stores them in Supabase Storage (a private bucket). In
 * development only, with no Supabase configured, they go to a private
 * `.uploads/` folder outside `public/`, so the flows can be exercised
 * locally; production never writes to the app's own filesystem.
 *
 * Every image is fetched through /api/media, which checks who may see it
 * (see `mediaAccess`) before redirecting to a short-lived signed URL or
 * streaming the local file.
 */

export const MEDIA_PREFIXES = ['logos', 'portfolio', 'reviews', 'jobs', 'ai'] as const
export type MediaPrefix = (typeof MEDIA_PREFIXES)[number]

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const LOCAL_ROOT = path.join(process.cwd(), '.uploads')

function localAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export function mediaUploadsAvailable(): boolean {
  return activeStorageBackend() === 'supabase' || localAllowed()
}

/** Checks the bytes, not the claimed type: JPEG, PNG or WebP only. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp'
  return null
}

export type ImageReadResult = { ok: true; bytes: Uint8Array; type: string } | { ok: false; error: string }

/** Reads an uploaded image from a form, refusing anything that is not a real image of a sane size. */
export async function readImageFile(file: FormDataEntryValue | null): Promise<ImageReadResult | null> {
  if (!(file instanceof File) || file.size === 0) return null
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Images must be under 8 MB.' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) return { ok: false, error: 'Use a JPEG, PNG or WebP image.' }
  return { ok: true, bytes, type }
}

function safeKey(key: string): string {
  const [prefix, ...rest] = key.split('/')
  if (!MEDIA_PREFIXES.includes(prefix as MediaPrefix) || rest.length === 0) throw new Error('bad media key')
  if (rest.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '..' || part === '.'))
    throw new Error('bad media key')
  return key
}

/** A fresh key under a prefix: "<prefix>/<owner>/<random>.<ext>". */
export function newMediaKey(prefix: MediaPrefix, owner: string, type: string): string {
  const ext = IMAGE_TYPES[type] ?? 'bin'
  const random = crypto.randomUUID().replace(/-/g, '')
  return safeKey(`${prefix}/${owner.replace(/[^A-Za-z0-9_-]/g, '')}/${random}.${ext}`)
}

export async function saveMedia(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  safeKey(key)
  if (activeStorageBackend() === 'supabase') {
    await uploadFile({ key, body: bytes, contentType })
    return
  }
  if (!localAllowed()) {
    throw new StorageUnavailableError('Image uploads need Supabase Storage configured.')
  }
  const target = path.join(LOCAL_ROOT, key)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
}

/** Where /api/media sends the browser, or the bytes to stream locally. */
export async function mediaSource(
  key: string
): Promise<{ redirect: string } | { bytes: Uint8Array; type: string } | null> {
  safeKey(key)
  if (activeStorageBackend() === 'supabase') {
    const url = await signedFileUrl(key, 600)
    return url ? { redirect: url } : null
  }
  if (!localAllowed()) return null
  try {
    const bytes = new Uint8Array(await readFile(path.join(LOCAL_ROOT, key)))
    return { bytes, type: sniffImageType(bytes) ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** The URL pages use for an image. Access is checked when it is fetched. */
export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/api/media/${key}` : null
}
