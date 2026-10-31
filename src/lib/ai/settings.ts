import 'server-only'

import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'

/**
 * Admin-set AI settings. The cost per image is what Doorlink's provider
 * bills for one generation, entered from the provider's own pricing or
 * invoice; Doorlink doesn't guess it. Limits are fair-use caps that keep
 * generation free for genuine customers and stop bots running up a bill.
 */
export const AI_SETTINGS_KEY = 'ai_generation_settings'

export interface AiSettings {
  /** Cents Doorlink pays per generated image; null until an admin sets it. */
  costPerImageCents: number | null
  perUserPerHour: number
  perUserPerDay: number
  /** Platform-wide daily ceiling on billable generations. */
  dailyCap: number
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  costPerImageCents: null,
  perUserPerHour: 8,
  perUserPerDay: 25,
  dailyCap: 1000,
}

export async function aiSettings(): Promise<AiSettings> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: AI_SETTINGS_KEY } })
    const value = (row?.value ?? {}) as Partial<AiSettings>
    return { ...DEFAULT_AI_SETTINGS, ...value }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return DEFAULT_AI_SETTINGS
    throw error
  }
}
