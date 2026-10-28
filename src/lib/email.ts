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
