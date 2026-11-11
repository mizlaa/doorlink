import 'server-only'

import type { DoorSpec } from '@/lib/configurator/options'
import { prisma } from '@/lib/prisma'
import { profileKey } from '@/lib/business/profile'
import { businessCard, ruleOwnerWhere, toRuleTerms } from './business'
import { eligibleBusinesses, extrasFor } from './compare'
import { matchRules, withExtras } from './engine'
import { requestFromSpec } from './products'

/**
 * The companies the designer lists under "Compare Local Quotes": approved,
 * subscribed businesses that serve the customer's postcode and supply the
 * product, each with what its own prices come to for the design on screen.
 *
 * Everything shown is real: a rating only when customers have left
 * reviews, a "verified" mark only when a Doorlink admin has checked the
 * licence and insurance, a price only when one of the company's own rules
 * covers this exact configuration. Nothing is estimated or filled in.
 */

export interface LocalCompany {
  key: string
  name: string
  logoUrl: string | null
  profileHref: string
  verified: boolean
  ratingAvg: number | null
  ratingCount: number
  jobsCompleted: number
  leadTimeDays: number | null
  /** Null when prices are withheld from this viewer, or the company has no automatic price for the design. */
  price: {
    fromCents: number
    toCents: number
    currency: string
    /** Every option at this price includes installation. */
    installed: boolean
    /** The company confirms the figure after a site measure. */
    estimate: boolean
  } | null
  /** Why there is no price, when there isn't one. */
  noPrice: 'withheld' | 'not-configured' | null
}

export async function localCompanies(
  spec: DoorSpec,
  postcode: string,
  options: { showPrices: boolean; limit?: number }
): Promise<LocalCompany[]> {
  const request = requestFromSpec(spec, { brand: null, installRequired: true })
  const candidates = await eligibleBusinesses(request.product, postcode)
  const companies: LocalCompany[] = []

  for (const { profile, travelFeeCents } of candidates) {
    const key = profileKey(profile)
    const card = await businessCard(key)
    if (!card) continue

    let price: LocalCompany['price'] = null
    let noPrice: LocalCompany['noPrice'] = options.showPrices ? 'not-configured' : 'withheld'
    if (options.showPrices) {
      const rules = await prisma.pricingRule.findMany({ where: { ...ruleOwnerWhere(key), product: request.product, active: true } })
      const result = matchRules(request, rules.map(toRuleTerms))
      if (result.available && result.options.length > 0) {
        const extras = extrasFor(profile, [], travelFeeCents)
        const priced = result.options.map((option) => withExtras(option, extras.lines))
        const totals = priced.map((option) => option.totalIncGstCents)
        price = {
          fromCents: Math.min(...totals),
          toCents: Math.max(...totals),
          currency: priced[0].currency,
          installed: priced.every((option) => option.installation !== 'NOT_INCLUDED'),
          estimate: priced.some((option) => option.priceType === 'ESTIMATE'),
        }
        noPrice = null
      }
    }

    companies.push({
      key: card.key,
      name: card.name,
      logoUrl: card.logoUrl,
      profileHref: card.profileHref ?? `/businesses/${card.key}`,
      verified: card.verified,
      ratingAvg: card.ratingAvg,
      ratingCount: card.ratingCount,
      jobsCompleted: card.jobsCompleted,
      leadTimeDays: card.leadTimeDays,
      price,
      noPrice,
    })
  }

  // Priced companies first, cheapest first; then by rating; then by name.
  companies.sort(
    (a, b) =>
      Number(b.price !== null) - Number(a.price !== null) ||
      (a.price?.fromCents ?? 0) - (b.price?.fromCents ?? 0) ||
      (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) ||
      a.name.localeCompare(b.name)
  )
  return companies.slice(0, options.limit ?? 12)
}
