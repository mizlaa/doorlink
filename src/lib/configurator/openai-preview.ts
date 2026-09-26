import 'server-only'

import { doorPreviewPrompt } from './preview-prompt'
import { PREVIEW_IMAGE_MAX_BYTES, sniffPreviewImageMime, type PreviewImageMime } from './preview-image-mime'
import type { DoorSpec } from './options'

const OPENAI_EDITS_URL = 'https://api.openai.com/v1/images/edits'
const TIMEOUT_MS = 90_000

export type PreviewGenerationResult = { dataUrl: string } | { error: string }

function extensionFor(mime: PreviewImageMime): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  return 'webp'
}

export async function generateDoorPreviewFromPhoto(input: {
  spec: DoorSpec
  imageBytes: Uint8Array
}): Promise<PreviewGenerationResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return { error: 'Photo preview is not connected yet.' }
  }

  if (input.imageBytes.length > PREVIEW_IMAGE_MAX_BYTES) {
    return { error: 'That photo is too large. Use a file under 8 MB.' }
  }

  const mime = sniffPreviewImageMime(input.imageBytes)
  if (!mime) {
    return { error: 'Use a JPEG, PNG, or WebP photo.' }
  }

  const prompt = doorPreviewPrompt(input.spec)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const form = new FormData()
    form.append('model', 'gpt-image-1')
    form.append('prompt', prompt)
    form.append('n', '1')
    form.append('size', '1024x1024')
    const copy = new Uint8Array(input.imageBytes)
    form.append(
      'image',
      new Blob([copy], { type: mime }),
      `photo.${extensionFor(mime)}`
    )

    const response = await fetch(OPENAI_EDITS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 429) {
        return { error: 'Too many requests. Wait a moment and try again.' }
      }
      if (response.status === 402 || response.status === 403) {
        return {
          error: 'The image provider refused the request. Check billing and model access on your OpenAI account.',
        }
      }
      return { error: 'The image provider could not generate a preview.' }
    }

    const body = (await response.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = body.data?.[0]?.b64_json
    if (!b64) {
      return { error: 'The image provider returned no image.' }
    }

    return { dataUrl: `data:image/png;base64,${b64}` }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { error: 'That took too long. Try a smaller photo or try again.' }
    }
    return { error: 'Could not reach the image provider. Try again.' }
  } finally {
    clearTimeout(timer)
  }
}
