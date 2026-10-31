'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac'
import { parseMoney } from '@/lib/pricing/validation'
import { AI_SETTINGS_KEY, aiSettings } from '@/lib/ai/settings'

export type AiSettingsState = { error?: string; ok?: boolean }

function whole(value: FormDataEntryValue | null, min: number, max: number): number | null {
  const n = Number(String(value ?? '').trim())
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export async function saveAiSettingsAction(_prev: AiSettingsState, formData: FormData): Promise<AiSettingsState> {
  const session = requirePermission(await getSession(), 'admin:settings')
  const costText = String(formData.get('cost') ?? '').trim()
  const cost = costText === '' ? null : parseMoney(costText)
  if (costText !== '' && (cost === null || cost > 10_000)) return { error: 'Enter the cost per image in dollars, like 0.19.' }
  const perUserPerHour = whole(formData.get('perHour'), 1, 500)
  const perUserPerDay = whole(formData.get('perDay'), 1, 2000)
  const dailyCap = whole(formData.get('dailyCap'), 1, 1_000_000)
  if (perUserPerHour === null || perUserPerDay === null || dailyCap === null)
    return { error: 'Limits are whole numbers.' }
  if (perUserPerHour > perUserPerDay) return { error: 'The hourly limit can’t be more than the daily one.' }

  const before = await aiSettings()
  const value = { costPerImageCents: cost, perUserPerHour, perUserPerDay, dailyCap }
  await prisma.$transaction([
    prisma.platformSetting.upsert({ where: { key: AI_SETTINGS_KEY }, update: { value }, create: { key: AI_SETTINGS_KEY, value } }),
    prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'ai.settings.update',
        entityType: 'PlatformSetting',
        entityId: AI_SETTINGS_KEY,
        metadata: { from: { ...before }, to: value },
      },
    }),
  ])
  revalidatePath('/admin/ai')
  return { ok: true }
}
