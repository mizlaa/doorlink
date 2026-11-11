import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({ after: () => undefined }))
import { verifyResendWebhook } from './delivery'

const secretBytes = Buffer.from('a-test-signing-secret-of-decent-length')
const secret = `whsec_${secretBytes.toString('base64')}`
const sign = (id: string, ts: string, body: string, key = secretBytes) => `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`

describe('Resend (Svix) webhook signature', () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } })
  const now = String(Math.floor(Date.now() / 1000))

  it('accepts a correctly signed, fresh event', () => {
    expect(verifyResendWebhook({ id: 'msg_1', timestamp: now, signature: sign('msg_1', now, body) }, body, secret)).toBe(true)
    // Svix may send several signatures during secret rotation.
    expect(verifyResendWebhook({ id: 'msg_1', timestamp: now, signature: `v1,bm9wZQ== ${sign('msg_1', now, body)}` }, body, secret)).toBe(true)
  })

  it('rejects a changed body, a wrong key, a stale timestamp or missing headers', () => {
    expect(verifyResendWebhook({ id: 'msg_1', timestamp: now, signature: sign('msg_1', now, body) }, body.replace('delivered', 'bounced'), secret)).toBe(false)
    expect(verifyResendWebhook({ id: 'msg_1', timestamp: now, signature: sign('msg_1', now, body, Buffer.from('other')) }, body, secret)).toBe(false)
    const old = String(Math.floor(Date.now() / 1000) - 600)
    expect(verifyResendWebhook({ id: 'msg_1', timestamp: old, signature: sign('msg_1', old, body) }, body, secret)).toBe(false)
    expect(verifyResendWebhook({ id: null, timestamp: now, signature: sign('msg_1', now, body) }, body, secret)).toBe(false)
  })
})
