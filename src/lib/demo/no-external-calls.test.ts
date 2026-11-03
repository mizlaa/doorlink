import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoBlockedError } from './mode'

// Demo mode must never reach Stripe, OpenAI, Resend or Supabase. These tests
// replace fetch with a spy and assert it is never called, and that the
// Stripe entry points refuse before any network work starts.

const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))

beforeEach(() => {
  vi.stubEnv('DOORLINK_DEMO', 'true')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_should_never_be_used')
  vi.stubEnv('OPENAI_API_KEY', 'sk-should-never-be-used')
  vi.stubEnv('RESEND_API_KEY', 're_should_never_be_used')
  vi.stubEnv('EMAIL_FROM', 'no-reply@example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-should-never-be-used')
  vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'doorlink-documents')
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('demo mode makes no external calls', () => {
  it('sends no email, even with Resend fully configured', async () => {
    const { sendEmail, emailConfigured } = await import('@/lib/email')
    expect(emailConfigured()).toBe(false)
    expect(await sendEmail({ to: 'someone@example.test', subject: 'Hi', text: 'Hello' })).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never reports a provider as connected except simulated payments', async () => {
    const { isConnected } = await import('@/lib/integrations')
    expect(isConnected('payments')).toBe(true)
    expect(isConnected('email')).toBe(false)
    expect(isConnected('storage')).toBe(false)
    expect(isConnected('ai')).toBe(false)
    expect(isConnected('push')).toBe(false)
  })

  it('refuses every Stripe client before a request is made', async () => {
    const { getStripeClient } = await import('@/lib/payments/stripe')
    expect(() => getStripeClient()).toThrow(DemoBlockedError)
    const { createJobCheckout, retrieveAccountState, refundJobPayment, processingFeeFor } = await import(
      '@/lib/payments/connect'
    )
    await expect(
      createJobCheckout({
        accountId: 'acct_demo_x',
        transactionId: 't',
        jobId: 'j',
        amountCents: 10000,
        applicationFeeCents: 100,
        currency: 'AUD',
        description: 'x',
        customerEmail: null,
        successUrl: 'https://a.test',
        cancelUrl: 'https://a.test',
      })
    ).rejects.toThrow(DemoBlockedError)
    await expect(retrieveAccountState('acct_demo_x')).rejects.toThrow(DemoBlockedError)
    expect(await processingFeeFor('acct_demo_x', 'pi_x')).toBeNull()
    expect(await refundJobPayment({ accountId: 'a', paymentIntentId: 'pi', idempotencyKey: 'k1' })).toBe('demo_refund_k1')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats Stripe webhooks as not configured', async () => {
    const { connectWebhookConfigured, connectConfigured } = await import('@/lib/payments/connect')
    expect(connectConfigured()).toBe(true)
    expect(connectWebhookConfigured()).toBe(false)
  })

  it('makes no OpenAI call for AI design images and returns a bundled sample', async () => {
    const { callImageProvider, aiImagesAvailable } = await import('@/lib/ai/design-image')
    expect(aiImagesAvailable()).toBe(true)
    const result = await callImageProvider({ prompt: 'a garage door', photo: null })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.b64.length).toBeGreaterThan(1000)
      expect(result.usage).toMatchObject({ demo: true })
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('makes no OpenAI call for the door photo preview', async () => {
    const { generateDoorPreviewFromPhoto } = await import('@/lib/configurator/openai-preview')
    const { doorPreviewAvailable } = await import('@/lib/configurator/preview')
    expect(doorPreviewAvailable()).toBe(true)
    const spec = { productType: 'garage-door' } as never
    const result = await generateDoorPreviewFromPhoto({ spec, imageBytes: new Uint8Array([1, 2, 3]) })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stores no uploads: new media keys point at bundled samples and nothing is written', async () => {
    const { newMediaKey, saveMedia, mediaUrl, mediaUploadsAvailable } = await import('@/lib/media')
    expect(mediaUploadsAvailable()).toBe(true)
    const key = newMediaKey('logos', 'owner-1', 'image/png')
    expect(key.startsWith('demo/logos/')).toBe(true)
    expect(mediaUrl(key)).toBe(`/${key}`)
    await expect(saveMedia(key, new Uint8Array([1]), 'image/png')).resolves.toBeUndefined()
    const { canUpload, uploadFile } = await import('@/lib/storage')
    expect(canUpload()).toBe(false)
    await expect(uploadFile({ key: 'x/y.png', body: new Uint8Array([1]), contentType: 'image/png' })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
