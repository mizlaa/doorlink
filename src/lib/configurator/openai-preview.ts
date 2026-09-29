import 'server-only'

import { doorPreviewPrompt } from './preview-prompt'
import { PREVIEW_IMAGE_MAX_BYTES, sniffPreviewImageMime, type PreviewImageMime } from './preview-image-mime'
import { previewFailureRefundsCredit } from './preview-failure'
import type { DoorSpec } from './options'

const OPENAI_EDITS_URL = 'https://api.openai.com/v1/images/edits'
const TIMEOUT_MS = 90_000

export type PreviewGenerationResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string; refundCredit: boolean }

function extensionFor(mime: PreviewImageMime): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  return 'webp'
}

export async function generateDoorPreviewFromPhoto(input: {
  spec: DoorSpec
  imageBytes: Uint8Array
  note?: string
}): Promise<PreviewGenerationResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return { ok: false, error: 'Photo preview is not connected yet.', refundCredit: true }
  }

  if (input.imageBytes.length > PREVIEW_IMAGE_MAX_BYTES) {
    return { ok: false, error: 'That photo is too large. Use a file under 8 MB.', refundCredit: true }
  }

  const mime = sniffPreviewImageMime(input.imageBytes)
  if (!mime) {
    return { ok: false, error: 'Use a JPEG, PNG, or WebP photo.', refundCredit: true }
  }

  const prompt = doorPreviewPrompt(input.spec, input.note)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const form = new FormData()
    form.append('model', 'gpt-image-1')
    form.append('prompt', prompt)
    form.append('n', '1')
    form.append('size', '1024x1024')
    // High quality at this size is about $0.17 of image output, plus a small
    // photo-input charge, so one preview is planned at about $0.18 USD.
    form.append('quality', 'high')
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
      const refundCredit = previewFailureRefundsCredit({ httpStatus: response.status, aborted: false, networkError: false })
      if (response.status === 429) {
        return { ok: false, error: 'Too many requests. Wait a moment and try again.', refundCredit }
      }
      if (response.status === 402 || response.status === 403) {
        return {
          ok: false,
          error: 'The image provider refused the request. Check billing and model access on your OpenAI account.',
          refundCredit,
        }
      }
      return {
        ok: false,
        error: 'The image provider could not generate a preview.',
        refundCredit,
      }
    }

    const body = (await response.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = body.data?.[0]?.b64_json
    if (!b64) {
      return {
        ok: false,
        error: 'The image provider returned no image.',
        refundCredit: true,
      }
    }

    return { ok: true, dataUrl: `data:image/png;base64,${b64}` }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    const refundCredit = previewFailureRefundsCredit({
      aborted,
      networkError: !aborted,
    })
    if (aborted) {
      return { ok: false, error: 'That took too long. Try a smaller photo or try again.', refundCredit }
    }
    return { ok: false, error: 'Could not reach the image provider. Try again.', refundCredit }
  } finally {
    clearTimeout(timer)
  }
}
