import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Text messages through Twilio, used for appointment reminders. Optional:
 * without TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM nothing is
 * sent and nothing claims to have been. A message counts as sent when
 * Twilio accepts it (it returns an id) and as delivered only when Twilio's
 * signed status callback says so.
 */

export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)
}

/** An Australian mobile in E.164 ("+61412345678"), or null when it isn't one. */
export function australianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+614\d{8}$/.test(digits)) return digits
  if (/^614\d{8}$/.test(digits)) return `+${digits}`
  if (/^04\d{8}$/.test(digits)) return `+61${digits.slice(1)}`
  return null
}

export type SmsResult = { ok: true; id: string } | { ok: false; error: string; configured: boolean; retryable: boolean }

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsConfigured()) return { ok: false, error: 'SMS is not set up on this site.', configured: false, retryable: false }
  const number = australianMobile(to)
  if (!number) return { ok: false, error: 'Not an Australian mobile number.', configured: true, retryable: false }
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const form = new URLSearchParams({ To: number, From: process.env.TWILIO_FROM!, Body: body.slice(0, 600) })
  // Twilio only calls back to a public https address; locally there is none to give it.
  if (SITE_URL.startsWith('https://')) form.set('StatusCallback', `${SITE_URL}/api/webhooks/twilio`)
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await response.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number }
    if (response.ok && data.sid) return { ok: true, id: data.sid }
    // 429 and 5xx are worth another try later; a bad number or account isn't.
    return { ok: false, error: data.message ? `Twilio: ${data.message}` : `Twilio returned ${response.status}.`, configured: true, retryable: response.status === 429 || response.status >= 500 }
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === 'TimeoutError' ? 'Twilio did not answer in time.' : 'Could not reach Twilio.', configured: true, retryable: true }
  }
}

/**
 * Twilio's request signature: base64 HMAC-SHA1, keyed with the auth token,
 * of the full callback URL followed by every POST field name and value in
 * name order.
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null, authToken: string): boolean {
  if (!signature) return false
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  const expected = Buffer.from(createHmac('sha1', authToken).update(data, 'utf8').digest('base64'))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
