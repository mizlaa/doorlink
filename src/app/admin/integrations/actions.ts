'use server'

import { getSession } from '@/lib/auth'
import { requirePermission, RbacError } from '@/lib/rbac'
import { audit } from '@/lib/audit'
import { rateLimit, tooManyMessage } from '@/lib/rate-limit'
import { checkProvider, PROVIDERS, type CheckResult, type ProviderId } from '@/lib/provider-checks'

export type CheckState = (CheckResult & { checkedAt: string }) | null

/** Runs one read-only call against a provider and records that an admin checked it (never the result's details). */
export async function checkProviderAction(_prev: CheckState, form: FormData): Promise<CheckState> {
  let actorId: string
  try {
    actorId = requirePermission(await getSession(), 'admin:settings').userId
  } catch (error) {
    if (error instanceof RbacError) return { ok: false, message: error.message, checkedAt: new Date().toISOString() }
    throw error
  }
  const id = String(form.get('provider') ?? '') as ProviderId
  if (!PROVIDERS.some((p) => p.id === id)) return { ok: false, message: 'Unknown service.', checkedAt: new Date().toISOString() }
  const limit = await rateLimit(`integration-check:${actorId}`, 30, 600)
  if (!limit.ok) return { ok: false, message: tooManyMessage(limit), checkedAt: new Date().toISOString() }

  const result = await checkProvider(id)
  await audit({ actorId, action: 'integration.check', entityType: 'Integration', entityId: id, metadata: { ok: result.ok, ...(result.mode ? { mode: result.mode } : {}) } })
  return { ...result, checkedAt: new Date().toISOString() }
}
