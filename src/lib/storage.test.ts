import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { resolveFileUrl, signedFileUrl, uploadFile } from './storage'

describe('resolveFileUrl with Supabase storage configured', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
    process.env.SUPABASE_STORAGE_BUCKET = 'doorlink-documents'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('never returns a public object URL for a private bucket', () => {
    expect(resolveFileUrl('manuals/faac/e045.pdf')).toBeNull()
    expect(resolveFileUrl('manual-submissions/sub_1.pdf')).toBeNull()
  })
})

describe('Supabase storage upload and signed preview', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
    process.env.SUPABASE_STORAGE_BUCKET = 'doorlink-documents'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('POSTs uploads to the private object endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await uploadFile({
      key: 'manual-submissions/sub_abc.pdf',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/storage/v1/object/doorlink-documents/manual-submissions/sub_abc.pdf',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('mints signed preview URLs for admin review', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ signedURL: '/object/sign/doorlink-documents/manual-submissions/sub_abc.pdf?token=x' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const url = await signedFileUrl('manual-submissions/sub_abc.pdf')
    expect(url).toBe(
      'https://example.supabase.co/storage/v1/object/sign/doorlink-documents/manual-submissions/sub_abc.pdf?token=x'
    )
  })
})
