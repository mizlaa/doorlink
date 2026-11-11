import 'server-only'

/**
 * Transactional email through Resend's HTTP API — only when it is set up.
 *
 * Needs RESEND_API_KEY and EMAIL_FROM (a verified sender, e.g.
 * "Doorlink <alerts@yourdomain.com.au>"). Without both, nothing is sent
 * and `sendEmail` says so by returning false: the in-app notification is
 * still written, and nothing pretends an email went out.
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
  /** Base64 file contents. */
  attachments?: Array<{ filename: string; content: string }>
}

export type EmailResult =
  | { ok: true; /** The provider's id for the message, for matching its delivery events. */ id: string; via: 'resend' | 'outbox' }
  | { ok: false; error: string; configured: boolean }

/**
 * Development only: with DOORLINK_EMAIL_OUTBOX=1 and no email provider,
 * messages are written to `.outbox/` instead of being sent, so the flows
 * that send (an invoice with its PDF) can be exercised locally. An address
 * ending in `@fail.test` is refused, to rehearse a failed send. Production
 * never uses this.
 */
function outboxEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DOORLINK_EMAIL_OUTBOX === '1' && !emailConfigured()
}

export function emailDeliverable(): boolean {
  return emailConfigured() || outboxEnabled()
}

/** Sends an email and says exactly what happened: accepted by the provider (with its id), or why not. */
export async function sendEmailDetailed(message: EmailMessage): Promise<EmailResult> {
  if (outboxEnabled()) {
    if (/@fail\.test$/i.test(message.to)) return { ok: false, error: 'The test outbox refuses addresses ending in @fail.test.', configured: true }
    const { mkdir, writeFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const id = `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const dir = path.join(process.cwd(), '.outbox')
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({ id, to: message.to, subject: message.subject, text: message.text, attachments: (message.attachments ?? []).map((a) => ({ filename: a.filename, bytes: Buffer.from(a.content, 'base64').length })) }, null, 2)
    )
    for (const attachment of message.attachments ?? []) await writeFile(path.join(dir, `${id}-${attachment.filename}`), Buffer.from(attachment.content, 'base64'))
    return { ok: true, id, via: 'outbox' }
  }
  if (!emailConfigured()) return { ok: false, error: 'Email sending isn’t connected yet.', configured: false }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(`Email failed: ${response.status} ${detail.slice(0, 300)}`)
      return { ok: false, error: `The email provider refused it (HTTP ${response.status}).`, configured: true }
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string }
    if (!body.id) return { ok: false, error: 'The email provider gave no confirmation.', configured: true }
    return { ok: true, id: body.id, via: 'resend' }
  } catch (error) {
    console.error('Email failed', error)
    return { ok: false, error: 'The email provider could not be reached.', configured: true }
  }
}

export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!emailConfigured()) return false
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) console.error(`Email to business failed: ${response.status}`)
    return response.ok
  } catch (error) {
    // An alert email must never break the action that triggered it.
    console.error('Email to business failed', error)
    return false
  }
}
