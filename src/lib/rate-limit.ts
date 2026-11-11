import 'server-only'

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { prisma } from './prisma'

/**
 * Rate limiting that works across every server instance: fixed-window
 * counters in the database, bumped atomically. No extra service to run.
 *
 * A limit that can't be checked (the database is down) lets the request
 * through — the action it guards will fail on the database anyway — and
 * says so in the log.
 */

export interface RateLimitResult {
  ok: boolean
  remaining: number
  /** Seconds until the window resets. */
  retryAfter: number
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000))
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
      RETURNING "count"`
    const count = Number(rows[0]?.count ?? 1)
    // Old windows are swept now and then, so the table stays small without a scheduled job.
    if (Math.random() < 0.01) void sweepRateLimits().catch(() => undefined)
    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter }
  } catch (error) {
    console.error('Rate limit check failed; allowing the request', error)
    return { ok: true, remaining: limit, retryAfter }
  }
}

export async function sweepRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  return result.count
}

/**
 * The caller's address, as the host's proxy reports it. Only ever used as
 * a hashed key, never stored or shown.
 */
export async function clientKey(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || h.get('x-real-ip') || 'unknown'
  return createHash('sha256')
    .update(`${process.env.AUTH_SECRET ?? 'doorlink'}:${ip}`)
    .digest('hex')
    .slice(0, 24)
}

/** The named limits, in one place so they can be read and tuned together. */
export const LIMITS = {
  signIn: { limit: 10, window: 15 * 60 },
  signInPerAccount: { limit: 8, window: 15 * 60 },
  register: { limit: 6, window: 60 * 60 },
  passwordReset: { limit: 5, window: 60 * 60 },
  mfaVerify: { limit: 8, window: 10 * 60 },
  publicForm: { limit: 12, window: 60 * 60 },
  measureRequest: { limit: 6, window: 60 * 60 },
  localQuotes: { limit: 90, window: 10 * 60 },
  aiGeneration: { limit: 12, window: 60 * 60 },
  invoiceShare: { limit: 60, window: 10 * 60 },
  invoiceSend: { limit: 30, window: 60 * 60 },
  api: { limit: 600, window: 60 * 60 },
} as const

export type LimitName = keyof typeof LIMITS

/** Checks a named limit for this caller (and an optional subject such as an email or user id). */
export async function limitFor(name: LimitName, subject?: string): Promise<RateLimitResult> {
  const { limit, window } = LIMITS[name]
  const who = subject ? createHash('sha256').update(subject.toLowerCase()).digest('hex').slice(0, 24) : await clientKey()
  return rateLimit(`${name}:${who}`, limit, window)
}

export function tooManyMessage(result: RateLimitResult): string {
  const minutes = Math.ceil(result.retryAfter / 60)
  return `Too many attempts. Try again in ${minutes <= 1 ? 'a minute' : `${minutes} minutes`}.`
}
