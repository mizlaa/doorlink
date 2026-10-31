import 'server-only'

import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { DoorSpec } from '@/lib/configurator/options'
import { mediaUploadsAvailable, newMediaKey, saveMedia } from '@/lib/media'
import { prisma } from '@/lib/prisma'
import { AI_MODEL, AI_PROVIDER, callImageProvider, designPrompt } from './design-image'
import { aiSettings } from './settings'

/**
 * Free AI design images, paid for by Doorlink.
 *
 * - Identical requests (same design, same photo, same notes, same model)
 *   are served from the stored image, at no cost, without calling the
 *   provider again — including a retry after a slow response.
 * - Fair-use limits per customer per hour and per day, and a platform
 *   daily cap, count only real (billable) provider calls.
 * - One generation in flight per customer, so a double click or a bot
 *   hammering the button can't stack up charges.
 * - Every attempt is recorded with its cost for the owner's dashboard.
 */

export type GenerateResult =
  | { ok: true; imageUrl: string; cached: boolean; generationId: string }
  | { ok: false; error: string }

const IN_FLIGHT_MS = 2 * 60 * 1000

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

export function generationCacheKey(spec: DoorSpec, photo: Uint8Array | null, note: string): string {
  const hash = createHash('sha256')
  hash.update(AI_MODEL)
  hash.update('\0')
  hash.update(stableStringify(spec))
  hash.update('\0')
  hash.update(photo ? createHash('sha256').update(photo).digest('hex') : 'no-photo')
  hash.update('\0')
  hash.update(note.trim().replace(/\s+/g, ' ').toLowerCase())
  return hash.digest('hex')
}

export async function generateDesignImage(input: {
  userId: string
  spec: DoorSpec
  photo: { bytes: Uint8Array; type: string } | null
  note: string
}): Promise<GenerateResult> {
  const cacheKey = generationCacheKey(input.spec, input.photo?.bytes ?? null, input.note)

  // 1. Already made: reuse it, free.
  const hit = await prisma.aiGeneration.findFirst({
    where: { cacheKey, status: 'SUCCEEDED', imageKey: { not: null } },
    orderBy: { createdAt: 'desc' },
  })
  if (hit?.imageKey) {
    // The image belongs to whoever generated it; a different customer gets
    // their own record pointing at the same stored image.
    const row = await prisma.aiGeneration.create({
      data: {
        userId: input.userId,
        cacheKey,
        status: 'SUCCEEDED',
        cached: true,
        provider: AI_PROVIDER,
        model: AI_MODEL,
        productType: input.spec.productType,
        hasPhoto: !!input.photo,
        imageKey: hit.imageKey,
        costCents: 0,
      },
    })
    return { ok: true, imageUrl: `/api/media/${hit.imageKey}?g=${row.id}`, cached: true, generationId: row.id }
  }

  // 2. Fair use.
  const settings = await aiSettings()
  const now = Date.now()
  const billable = { cached: false, status: { in: ['SUCCEEDED', 'PENDING'] as Array<'SUCCEEDED' | 'PENDING'> } }
  const [inFlight, lastHour, lastDay, platformToday] = await Promise.all([
    prisma.aiGeneration.count({
      where: { userId: input.userId, status: 'PENDING', createdAt: { gte: new Date(now - IN_FLIGHT_MS) } },
    }),
    prisma.aiGeneration.count({ where: { userId: input.userId, ...billable, createdAt: { gte: new Date(now - 3600_000) } } }),
    prisma.aiGeneration.count({ where: { userId: input.userId, ...billable, createdAt: { gte: new Date(now - 86_400_000) } } }),
    prisma.aiGeneration.count({ where: { ...billable, createdAt: { gte: new Date(now - 86_400_000) } } }),
  ])
  if (inFlight > 0) return { ok: false, error: 'Your design is already being generated. It’ll appear in a moment.' }
  if (lastHour >= settings.perUserPerHour)
    return { ok: false, error: 'You’ve made a lot of images this hour. Try again a little later; it’s still free.' }
  if (lastDay >= settings.perUserPerDay)
    return { ok: false, error: 'You’ve reached today’s fair-use limit for AI images. It resets tomorrow and stays free.' }
  if (platformToday >= settings.dailyCap)
    return { ok: false, error: 'AI images are very busy today. Try again tomorrow; your 3D design still works.' }

  // 3. Generate.
  const row = await prisma.aiGeneration.create({
    data: {
      userId: input.userId,
      cacheKey,
      status: 'PENDING',
      provider: AI_PROVIDER,
      model: AI_MODEL,
      productType: input.spec.productType,
      hasPhoto: !!input.photo,
    },
  })
  const started = Date.now()
  const result = await callImageProvider({
    prompt: designPrompt(input.spec, input.note, !!input.photo),
    photo: input.photo,
  })
  const durationMs = Date.now() - started

  if (!result.ok) {
    await prisma.aiGeneration.update({
      where: { id: row.id },
      data: { status: 'FAILED', error: `${result.status ?? 'network'}: ${result.error}`, durationMs, costCents: 0 },
    })
    return { ok: false, error: result.error }
  }

  // Stored before answering, so a retry after a dropped response is a free cache hit.
  const bytes = Uint8Array.from(Buffer.from(result.b64, 'base64'))
  let imageKey: string | null = null
  if (mediaUploadsAvailable()) {
    imageKey = newMediaKey('ai', input.userId, 'image/png')
    try {
      await saveMedia(imageKey, bytes, 'image/png')
    } catch (error) {
      console.error('Could not store AI image', error)
      imageKey = null
    }
  }
  await prisma.aiGeneration.update({
    where: { id: row.id },
    data: {
      status: 'SUCCEEDED',
      imageKey,
      durationMs,
      costCents: settings.costPerImageCents,
      usage: (result.usage ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
  return {
    ok: true,
    imageUrl: imageKey ? `/api/media/${imageKey}` : `data:image/png;base64,${result.b64}`,
    cached: false,
    generationId: row.id,
  }
}
