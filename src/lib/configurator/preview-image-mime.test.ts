import { describe, expect, it } from 'vitest'
import { PREVIEW_IMAGE_MAX_BYTES, sniffPreviewImageMime } from './preview-image-mime'

describe('sniffPreviewImageMime', () => {
  it('detects jpeg, png, and webp signatures', () => {
    expect(sniffPreviewImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg')
    expect(
      sniffPreviewImageMime(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
      )
    ).toBe('image/png')
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(sniffPreviewImageMime(webp)).toBe('image/webp')
  })

  it('rejects unknown bytes', () => {
    expect(sniffPreviewImageMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull()
  })

  it('documents the upload size cap', () => {
    expect(PREVIEW_IMAGE_MAX_BYTES).toBe(8 * 1024 * 1024)
  })
})
