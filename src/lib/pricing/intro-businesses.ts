import 'server-only'

import { businessIsEligible, loadBusinessProfile } from '@/lib/business/profile'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { prisma } from '@/lib/prisma'
import { businessCard, decodeBusinessKey } from './business'

/**
 * Businesses the Doorlink intro may show: approved by Doorlink and able to
 * take quotes (active subscription). Nothing here is invented: names,
 * ratings and review counts come from the database. Returns an empty list
 * when there are none or the database can't be read; the intro then shows
 * no company names.
 */
export interface IntroBusiness {
  key: string
  name: string
  ratingAvg: number | null
  ratingCount: number
  suburb: string | null
  leadTimeDays: number | null
}

export async function introBusinesses(limit = 12): Promise<IntroBusiness[]> {
  try {
    const profiles = await prisma.businessProfile.findMany({
      where: { status: 'APPROVED' },
      select: { businessKey: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    })
    const out: IntroBusiness[] = []
    for (const profile of profiles) {
      const key = decodeBusinessKey(profile.businessKey)
      if (!key) continue
      if (!(await businessIsEligible(key, profile))) continue
      const card = await businessCard(key)
      if (!card) continue
      const row = await loadBusinessProfile(profile.businessKey)
      out.push({
        key: card.key,
        name: card.name,
        ratingAvg: card.ratingAvg,
        ratingCount: card.ratingCount,
        suburb: card.baseSuburb,
        leadTimeDays: row?.leadTimeDays ?? null,
      })
      if (out.length >= limit) break
    }
    return out
  } catch (error) {
    if (isDatabaseUnreachable(error)) return []
    throw error
  }
}
