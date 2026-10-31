import 'server-only'

import { describeSpec, familyOf, type DoorSpec } from '@/lib/configurator/options'
import { PREVIEW_NOTE_MAX_WORDS, previewNoteWordCount } from '@/lib/configurator/preview-prompt'

/**
 * The image provider call for AI design visualisations (OpenAI Images).
 * Billed to Doorlink's own API account: the key never leaves the server,
 * and customers never see or pay for a request.
 */

export const AI_PROVIDER = 'openai'
export const AI_MODEL = 'gpt-image-2.5-sunburst'
const GENERATIONS_URL = 'https://api.openai.com/v1/images/generations'
const EDITS_URL = 'https://api.openai.com/v1/images/edits'
const TIMEOUT_MS = 90_000

export function aiImagesAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY
}

const SUBJECT: Record<ReturnType<typeof familyOf>, string> = {
  garage: 'garage door on a residential home',
  gate: 'automated driveway gate at the front of an Australian home',
  fence: 'front fence of an Australian home',
  shutter: 'roller shutter',
}

export function designPrompt(spec: DoorSpec, note: string, hasPhoto: boolean): string {
  const summary = describeSpec(spec)
    .map((row) => `${row.label}: ${row.value}`)
    .join('; ')
  const subject = spec.productType === 'shop-shutter' ? 'roller shutter on a shopfront' : spec.productType === 'window-shutter' ? 'window roller shutter on a home' : SUBJECT[familyOf(spec.productType)]
  const lines = hasPhoto
    ? [
        `Edit this photo so it shows a new ${subject} matching this generic specification (not any real manufacturer’s product): ${summary}.`,
        'Keep the building, surroundings, lighting and camera angle realistic and unchanged.',
      ]
    : [
        `A photorealistic, well-lit photograph of a new ${subject} matching this generic specification (not any real manufacturer’s product): ${summary}.`,
        'Eye-level view from the street, natural daylight.',
      ]
  lines.push('Do not add logos, text or brand names.')
  const extra = note.trim()
  if (extra && previewNoteWordCount(extra) <= PREVIEW_NOTE_MAX_WORDS) lines.push(`Customer notes: ${extra}`)
  return lines.join(' ')
}

export type ProviderResult =
  | { ok: true; b64: string; usage: unknown }
  | { ok: false; error: string; status: number | null }

export async function callImageProvider(input: {
  prompt: string
  photo: { bytes: Uint8Array; type: string } | null
}): Promise<ProviderResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { ok: false, error: 'AI visualisation isn’t connected yet.', status: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let response: Response
    if (input.photo) {
      const form = new FormData()
      form.append('model', AI_MODEL)
      form.append('prompt', input.prompt)
      form.append('n', '1')
      form.append('size', '1024x1024')
      form.append('quality', 'high')
      const ext = input.photo.type === 'image/png' ? 'png' : input.photo.type === 'image/webp' ? 'webp' : 'jpg'
      form.append('image', new Blob([new Uint8Array(input.photo.bytes)], { type: input.photo.type }), `photo.${ext}`)
      response = await fetch(EDITS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal,
      })
    } else {
      response = await fetch(GENERATIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: AI_MODEL, prompt: input.prompt, n: 1, size: '1024x1024', quality: 'high' }),
        signal: controller.signal,
      })
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          response.status === 429
            ? 'Lots of people are designing right now. Try again in a minute.'
            : 'The image couldn’t be generated. Try again.',
      }
    }
    const body = (await response.json()) as { data?: Array<{ b64_json?: string }>; usage?: unknown }
    const b64 = body.data?.[0]?.b64_json
    if (!b64) return { ok: false, error: 'The image couldn’t be generated. Try again.', status: response.status }
    return { ok: true, b64, usage: body.usage ?? null }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, status: null, error: aborted ? 'That took too long. Try again.' : 'Couldn’t reach the image service. Try again.' }
  } finally {
    clearTimeout(timer)
  }
}
