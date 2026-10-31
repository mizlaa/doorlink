import 'server-only'

import { NotificationType, Prisma, type PricedProduct } from '@prisma/client'
import type { DoorSpec } from '@/lib/configurator/options'
import { prisma } from '@/lib/prisma'
import { makeReference } from '@/lib/reference'
import { formatMoney } from '@/lib/money'
import { PROFILE_INCLUDE, profileKey, type FullBusinessProfile } from '@/lib/business/profile'
import { travelFeeFor } from '@/lib/business/coverage'
import { accessoriesFor, accessoryLabel } from './accessories'
import { businessCard, businessIsSubscribed, ruleOwnerWhere, toRuleTerms } from './business'
import { matchRules, withExtras, type QuoteLine, type QuoteRequest, type UnavailableReason } from './engine'
import { notifyBusiness } from './notify'
import { productLabel } from './products'

/**
 * "Compare free quotes": every approved, subscribed business that serves
 * the customer's postcode and supplies the product is checked against its
 * own prices. A business with a matching price gets a quote (snapshotted,
 * so later price changes never alter it); one without is listed so the
 * customer can ask it for a custom quote. No price is ever estimated.
 */

export interface CompareInput {
  customerId: string
  customerFirstName: string
  spec: DoorSpec
  request: QuoteRequest
  postcode: string
  suburb: string | null
  accessories: string[]
}

export interface UnavailableBusiness {
  businessKey: string
  name: string
  reason: UnavailableReason
}

/** Approved businesses that serve a postcode and supply a product, with their travel fee. */
export async function eligibleBusinesses(product: PricedProduct, postcode: string) {
  const profiles = await prisma.businessProfile.findMany({ where: { status: 'APPROVED' }, include: PROFILE_INCLUDE })
  const found: Array<{ profile: FullBusinessProfile; travelFeeCents: number }> = []
  for (const profile of profiles) {
    const travelFeeCents = travelFeeFor(profile.serviceAreas, postcode)
    if (travelFeeCents === null) continue
    const key = profileKey(profile)
    const supplies =
      profile.products.includes(product) ||
      (await prisma.pricingRule.count({ where: { ...ruleOwnerWhere(key), product, active: true } })) > 0
    if (!supplies) continue
    if (!(await businessIsSubscribed(key))) continue
    found.push({ profile, travelFeeCents })
  }
  return found
}

/** The accessory and travel lines a business adds, and the accessories it has no price for. */
export function extrasFor(
  profile: Pick<FullBusinessProfile, 'accessories'>,
  wanted: string[],
  travelFeeCents: number
): { lines: QuoteLine[]; unpriced: string[] } {
  const lines: QuoteLine[] = []
  const unpriced: string[] = []
  for (const id of wanted) {
    const priced = profile.accessories.find((a) => a.accessory === id)
    if (priced) lines.push({ kind: 'accessory', label: accessoryLabel(id), amountCents: priced.priceCents, gst: priced.gst })
    else unpriced.push(id)
  }
  if (travelFeeCents > 0) lines.push({ kind: 'travel', label: 'Travel', amountCents: travelFeeCents, gst: 'INCLUSIVE' })
  return { lines, unpriced }
}

export async function compareQuotes(input: CompareInput): Promise<string> {
  const { request } = input
  const wanted = input.accessories.filter((id) =>
    accessoriesFor(request.product, request.motorRequired).some((a) => a.id === id)
  )
  const candidates = await eligibleBusinesses(request.product, input.postcode)

  const issued: Array<{ key: ReturnType<typeof profileKey>; name: string; data: Prisma.AutomatedQuoteCreateWithoutComparisonInput; cheapest: number }> = []
  const unavailable: UnavailableBusiness[] = []

  for (const { profile, travelFeeCents } of candidates) {
    const key = profileKey(profile)
    const card = await businessCard(key)
    if (!card) continue
    const rules = await prisma.pricingRule.findMany({ where: { ...ruleOwnerWhere(key), product: request.product, active: true } })
    const result = matchRules(request, rules.map(toRuleTerms))
    if (!result.available) {
      unavailable.push({ businessKey: card.key, name: card.name, reason: result.reason })
      continue
    }
    const extras = extrasFor(profile, wanted, travelFeeCents)
    const options = result.options
      .map((option) => withExtras(option, extras.lines))
      .sort((a, b) => a.totalIncGstCents - b.totalIncGstCents)
    issued.push({
      key,
      name: card.name,
      cheapest: options[0].totalIncGstCents,
      data: {
        reference: makeReference('QTE', 8),
        customer: { connect: { id: input.customerId } },
        ...(key.kind === 'organization'
          ? { businessOrganization: { connect: { id: key.id } } }
          : { businessUser: { connect: { id: key.id } } }),
        businessName: card.name,
        product: request.product,
        productStyle: request.productStyle,
        spec: input.spec as unknown as Prisma.InputJsonValue,
        widthMm: request.widthMm,
        heightMm: request.heightMm,
        requestedBrand: request.brand,
        motorRequired: request.motorRequired,
        requestedMotor: request.motorBrand,
        installRequired: request.installRequired,
        postcode: input.postcode,
        accessories: wanted,
        warranty: profile.warranty,
        leadTimeDays: profile.leadTimeDays,
        options: {
          create: options.map((option, sortOrder) => ({
            ruleId: option.ruleId,
            productBrand: [option.productBrand, option.productModel].filter(Boolean).join(' ') || null,
            motorIncluded: option.motorIncluded,
            motorBrand: option.motorBrand,
            installation: option.installation,
            gst: option.gst,
            priceCents: option.priceCents,
            installPriceCents: option.installPriceCents,
            subtotalExGstCents: option.subtotalExGstCents,
            gstCents: option.gstCents,
            totalIncGstCents: option.totalIncGstCents,
            currency: option.currency,
            note: option.note,
            priceType: option.priceType,
            lines: option.lines as unknown as Prisma.InputJsonValue,
            unpricedAccessories: extras.unpriced,
            sortOrder,
          })),
        },
      },
    })
  }

  const reference = makeReference('CMP', 8)
  await prisma.quoteComparison.create({
    data: {
      reference,
      customerId: input.customerId,
      product: request.product,
      spec: input.spec as unknown as Prisma.InputJsonValue,
      widthMm: request.widthMm,
      heightMm: request.heightMm,
      postcode: input.postcode,
      suburb: input.suburb,
      requestedBrand: request.brand,
      motorRequired: request.motorRequired,
      requestedMotor: request.motorBrand,
      installRequired: request.installRequired,
      accessories: wanted,
      unavailable: unavailable as unknown as Prisma.InputJsonValue,
      quotes: { create: issued.map((q) => q.data) },
    },
  })

  // Each business hears about its quote in the app; email waits for a booking.
  await Promise.all(
    issued.map((q) =>
      notifyBusiness(
        q.key,
        {
          type: NotificationType.LEAD_MATCHED,
          title: `New quote request: ${productLabel(request.product)} ${request.widthMm} × ${request.heightMm} mm`,
          body: `${input.customerFirstName} in ${input.postcode} was quoted ${formatMoney(q.cheapest)} inc GST from your prices.`,
          href: '/pricing/quotes',
        },
        { email: false }
      )
    )
  )
  return reference
}
