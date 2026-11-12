import 'server-only'

import { prisma } from '@/lib/prisma'
import { AI_MODEL as IMAGE_MODEL } from '@/lib/ai/design-image'

/**
 * Every outside service the app talks to, what it needs, and one safe call
 * that proves the credentials work. Only variable NAMES ever leave this
 * module: values are read here and sent to their own provider, never shown,
 * returned or logged.
 */

export type ProviderId = 'database' | 'auth' | 'storage' | 'stripe' | 'resend' | 'twilio' | 'anthropic' | 'openai' | 'cron' | 'push'

/** The model the manual-review feature calls (see lib/manuals/ai-review.ts). */
const REVIEW_MODEL = 'claude-opus-5'

export interface Provider {
  id: ProviderId
  name: string
  /** What stops working without it. */
  feature: string
  required: string[]
  optional?: string[]
  /** Paths on NEXT_PUBLIC_SITE_URL to register with the provider, and the events each wants. */
  callbacks?: Array<{ path: string; events?: string }>
  /** Required by the whole app rather than one feature. */
  core?: boolean
  /** Built in the code, but switched off whatever is set. */
  notBuilt?: string
}

export const PROVIDERS: Provider[] = [
  { id: 'database', name: 'Postgres (Supabase database)', feature: 'Everything', required: ['DATABASE_URL', 'DIRECT_URL'], core: true },
  {
    id: 'auth',
    name: 'Supabase Auth',
    feature: 'Sign-in, sign-up and password reset',
    required: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_SECRET'],
    optional: ['MFA_ENCRYPTION_KEY'],
    callbacks: [{ path: '/auth/confirm', events: 'Redirect URL (password reset and email confirmation)' }],
    core: true,
  },
  { id: 'storage', name: 'Supabase Storage', feature: 'Logos, documents and photo uploads', required: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET'] },
  {
    id: 'stripe',
    name: 'Stripe (with Connect)',
    feature: 'Subscriptions, job deposits and invoice payments',
    required: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    optional: ['STRIPE_CONNECT_WEBHOOK_SECRET'],
    callbacks: [
      {
        path: '/api/webhooks/stripe',
        events: 'checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, payout.paid, payout.failed, transfer.paid, transfer.failed',
      },
      {
        path: '/api/webhooks/stripe-connect',
        events: 'Connected accounts: account.updated, checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, payment_intent.payment_failed, charge.refunded, charge.dispute.created',
      },
    ],
  },
  {
    id: 'resend',
    name: 'Resend (email)',
    feature: 'Invoice, quote, reminder and account email',
    required: ['RESEND_API_KEY', 'EMAIL_FROM'],
    optional: ['RESEND_WEBHOOK_SECRET'],
    callbacks: [{ path: '/api/webhooks/resend', events: 'email.delivered, email.bounced, email.complained' }],
  },
  {
    id: 'twilio',
    name: 'Twilio (SMS)',
    feature: 'Appointment reminder texts',
    required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'],
    callbacks: [{ path: '/api/webhooks/twilio', events: 'Sent automatically as each text’s status callback (no dashboard step)' }],
  },
  { id: 'anthropic', name: 'Anthropic (Claude)', feature: 'Automatic review of submitted manuals', required: ['ANTHROPIC_API_KEY'] },
  { id: 'openai', name: 'OpenAI Images', feature: 'Photo preview of a design', required: ['OPENAI_API_KEY'] },
  {
    id: 'cron',
    name: 'Scheduler (cron)',
    feature: 'Hourly reminders and daily job housekeeping',
    required: ['CRON_SECRET'],
    callbacks: [
      { path: '/api/cron/reminders', events: 'GET hourly with Authorization: Bearer <CRON_SECRET>' },
      { path: '/api/cron/jobs', events: 'GET daily with Authorization: Bearer <CRON_SECRET>' },
    ],
  },
  {
    id: 'push',
    name: 'Web push',
    feature: 'Phone notifications',
    required: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
    notBuilt: 'Sending push notifications is not built yet; the keys have no effect.',
  },
]

const present = (name: string) => !!process.env[name]?.trim()

export function missingVariables(provider: Provider): string[] {
  return provider.required.filter((name) => !present(name))
}

export type CheckResult = { ok: boolean; message: string; mode?: 'test' | 'live' }

const TIMEOUT = 10_000

async function get(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' })
}

/** A provider's refusal in words, by status only: response bodies can echo request details. */
function refused(status: number): CheckResult {
  if (status === 401 || status === 403) return { ok: false, message: `The provider rejected the credentials (HTTP ${status}). Check the key was copied in full and belongs to this account.` }
  if (status === 404) return { ok: false, message: 'The provider could not find what the settings point at (HTTP 404).' }
  if (status === 429) return { ok: false, message: 'The provider is rate limiting this account (HTTP 429). Try again in a minute.' }
  return { ok: false, message: `The provider answered HTTP ${status}. Try again shortly.` }
}

function unreachable(error: unknown): CheckResult {
  const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
  return { ok: false, message: timedOut ? 'The provider did not answer within 10 seconds.' : 'The provider could not be reached from the server.' }
}

function keyMode(key: string): 'test' | 'live' {
  return /_test_/.test(key) ? 'test' : 'live'
}

/** One read-only call per provider. Never sends, charges or writes anything. */
export async function checkProvider(id: ProviderId): Promise<CheckResult> {
  const provider = PROVIDERS.find((p) => p.id === id)
  if (!provider) return { ok: false, message: 'Unknown service.' }
  if (provider.notBuilt) return { ok: false, message: provider.notBuilt }
  const missing = missingVariables(provider)
  if (missing.length) return { ok: false, message: `Not set: ${missing.join(', ')}.` }
  const env = (name: string) => process.env[name]!.trim()

  try {
    switch (id) {
      case 'database': {
        await prisma.$queryRaw`SELECT 1`
        // The schema is applied with `prisma db push` (docs/OPERATIONS.md), so check a table the app needs rather than a migration history.
        const [table] = await prisma.$queryRaw<Array<{ t: string | null }>>`SELECT to_regclass('"Invoice"')::text AS t`
        if (!table?.t) return { ok: false, message: 'Connected, but the app’s tables are missing. Apply the schema as described in docs/OPERATIONS.md.' }
        return { ok: true, message: 'Connected, and the app’s tables are in place.' }
      }
      case 'auth': {
        if (env('AUTH_SECRET').length < 32) return { ok: false, message: 'AUTH_SECRET is shorter than 32 characters. Generate a longer one.' }
        const res = await get(`${env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')}/auth/v1/settings`, { apikey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY') })
        if (!res.ok) return refused(res.status)
        const admin = await get(`${env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')}/auth/v1/admin/users?per_page=1`, {
          apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
          Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
        })
        if (!admin.ok) return { ok: false, message: `The public key works, but the service-role key was refused (HTTP ${admin.status}).` }
        return { ok: true, message: 'Both the public key and the service-role key were accepted.' }
      }
      case 'storage': {
        const base = env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
        const res = await get(`${base}/storage/v1/bucket/${encodeURIComponent(env('SUPABASE_STORAGE_BUCKET'))}`, {
          apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
          Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
        })
        if (res.status === 400 || res.status === 404) return { ok: false, message: `There is no bucket named “${env('SUPABASE_STORAGE_BUCKET')}”. Create it (private) in Supabase Storage.` }
        if (!res.ok) return refused(res.status)
        const bucket = (await res.json().catch(() => ({}))) as { public?: boolean }
        return bucket.public
          ? { ok: false, message: 'The bucket exists but is public. Make it private: the app hands out signed links.' }
          : { ok: true, message: 'The private bucket exists and the service-role key can reach it.' }
      }
      case 'stripe': {
        const key = env('STRIPE_SECRET_KEY')
        const res = await get('https://api.stripe.com/v1/balance', { Authorization: `Bearer ${key}` })
        if (!res.ok) return refused(res.status)
        const connect = present('STRIPE_CONNECT_WEBHOOK_SECRET') ? '' : ' STRIPE_CONNECT_WEBHOOK_SECRET is not set, so businesses’ job payments won’t be recorded.'
        return { ok: true, mode: keyMode(key), message: `Key accepted (${keyMode(key)} mode).${connect}` }
      }
      case 'resend': {
        const res = await get('https://api.resend.com/domains', { Authorization: `Bearer ${env('RESEND_API_KEY')}` })
        if (!res.ok) return refused(res.status)
        const body = (await res.json().catch(() => ({}))) as { data?: Array<{ name: string; status: string }> }
        const from = env('EMAIL_FROM')
        const domain = (from.match(/@([^>\s]+)/)?.[1] ?? '').toLowerCase()
        const match = body.data?.find((d) => d.name.toLowerCase() === domain)
        if (!match) return { ok: false, message: `Key accepted, but ${domain || 'the EMAIL_FROM domain'} is not added in Resend → Domains.` }
        if (match.status !== 'verified') return { ok: false, message: `Key accepted, but ${domain} is “${match.status}” in Resend. Finish its DNS records.` }
        return { ok: true, message: `Key accepted and ${domain} is verified.` }
      }
      case 'twilio': {
        const sid = env('TWILIO_ACCOUNT_SID')
        const auth = Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')
        const res = await get(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, { Authorization: `Basic ${auth}` })
        if (!res.ok) return refused(res.status)
        const account = (await res.json().catch(() => ({}))) as { status?: string; type?: string }
        if (account.status !== 'active') return { ok: false, message: `The Twilio account is “${account.status ?? 'unknown'}”.` }
        const trial = account.type === 'Trial' ? ' Trial account: texts only reach verified numbers.' : ''
        return { ok: true, mode: account.type === 'Trial' ? 'test' : 'live', message: `Credentials accepted; account active.${trial}` }
      }
      case 'anthropic': {
        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 0, timeout: TIMEOUT })
        try {
          await client.models.retrieve(REVIEW_MODEL)
          return { ok: true, message: `Key accepted; ${REVIEW_MODEL} is available.` }
        } catch (error) {
          if (error instanceof Anthropic.APIError && typeof error.status === 'number') return refused(error.status)
          return unreachable(error)
        }
      }
      case 'openai': {
        const res = await get(`https://api.openai.com/v1/models/${encodeURIComponent(IMAGE_MODEL)}`, { Authorization: `Bearer ${env('OPENAI_API_KEY')}` })
        if (res.status === 404) return { ok: false, message: `Key accepted, but this account has no access to ${IMAGE_MODEL}.` }
        if (!res.ok) return refused(res.status)
        return { ok: true, message: `Key accepted; ${IMAGE_MODEL} is available.` }
      }
      case 'cron': {
        if (env('CRON_SECRET').length < 24) return { ok: false, message: 'CRON_SECRET is shorter than 24 characters. Generate a longer one.' }
        const last = await prisma.appointmentEvent.findFirst({ where: { type: { in: ['REMINDER_EMAILED', 'REMINDER_SMS_SENT'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
        return { ok: true, message: last ? `Secret set. Last reminder went out ${last.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.` : 'Secret set. No reminder has gone out yet.' }
      }
      case 'push':
        return { ok: false, message: provider.notBuilt ?? '' }
    }
  } catch (error) {
    if (id === 'database') return { ok: false, message: 'The database could not be reached with DATABASE_URL.' }
    return unreachable(error)
  }
}
