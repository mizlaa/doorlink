import 'server-only'

import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import {
  COMMISSION_EXEMPT_SETTING_KEY,
  COMMISSION_SETTING_KEY,
  DEFAULT_COMMISSION_BPS,
  MAX_COMMISSION_BPS,
} from './commission'

/**
 * The rate an admin has configured, or the default when nothing is set
 * or the database is unreachable. Quoting UI reads this to *preview* a
 * split; the rate that actually governs a job is snapshotted onto the
 * Transaction when the quote is accepted.
 */
export async function currentCommissionBps(): Promise<number> {
  try {
    const setting = await prisma.platformSetting.findUnique({ where: { key: COMMISSION_SETTING_KEY } })
    if (!setting) return DEFAULT_COMMISSION_BPS

    const value = typeof setting.value === 'number' ? setting.value : Number(setting.value)
    if (!Number.isInteger(value) || value < 0 || value > MAX_COMMISSION_BPS) {
      return DEFAULT_COMMISSION_BPS
    }
    return value
  } catch (error) {
    if (isDatabaseUnreachable(error)) return DEFAULT_COMMISSION_BPS
    throw error
  }
}

/** Business keys ("o_…" / "u_…") an admin has made fee-free. */
export async function commissionExemptKeys(): Promise<string[]> {
  try {
    const setting = await prisma.platformSetting.findUnique({ where: { key: COMMISSION_EXEMPT_SETTING_KEY } })
    const value = setting?.value
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch (error) {
    if (isDatabaseUnreachable(error)) return []
    throw error
  }
}

/**
 * The rate for work done by a worker: zero when the worker's own account,
 * or an organisation they belong to, is fee-free.
 */
export async function commissionBpsForWorker(workerUserId: string): Promise<number> {
  const [rate, exempt, memberships] = await Promise.all([
    currentCommissionBps(),
    commissionExemptKeys(),
    prisma.organizationMember.findMany({ where: { userId: workerUserId }, select: { organizationId: true } }),
  ])
  if (exempt.length === 0) return rate
  const keys = [`u_${workerUserId}`, ...memberships.map((m) => `o_${m.organizationId}`)]
  return keys.some((key) => exempt.includes(key)) ? 0 : rate
}

/** The rate a business's next booking will carry, from its business key. */
export async function commissionBpsForBusiness(businessKey: string): Promise<number> {
  const [rate, exempt] = await Promise.all([currentCommissionBps(), commissionExemptKeys()])
  return exempt.includes(businessKey) ? 0 : rate
}
