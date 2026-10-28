'use server'

import { redirect } from 'next/navigation'
import { NotificationType, Prisma } from '@prisma/client'
import { getSession, type Session } from '@/lib/auth'
import { parseSpec, type DoorSpec } from '@/lib/configurator/options'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { prisma } from '@/lib/prisma'
import { makeReference } from '@/lib/reference'
import { RbacError, requirePermission } from '@/lib/rbac'
import {
  businessCard,
  businessIsSubscribed,
  decodeBusinessKey,
  ruleOwnerWhere,
  toRuleTerms,
} from '@/lib/pricing/business'
import { matchRules, type UnavailableReason } from '@/lib/pricing/engine'
import { productLabel, requestFromSpec } from '@/lib/pricing/products'
import { notifyBusiness } from '@/lib/pricing/notify'
import { formatMoney } from '@/lib/money'

export type QuoteRequestState = {
  error?: string
  unavailable?: { businessKey: string; businessName: string; reason: UnavailableReason }
}

/**
 * Issues an automated quote from one business's own prices for the
 * customer's design. Everything is re-read on the server: the design is
 * re-validated, the business must still be subscribed, and its rules are
 * read here and never sent to the browser. No rule, no quote — the
 * customer is told plainly instead.
 */
export async function requestQuoteAction(
  _prev: QuoteRequestState,
  formData: FormData
): Promise<QuoteRequestState> {
  let session: Session
  try {
    session = requirePermission(await getSession(), 'quote:request')
  } catch (error) {
    if (error instanceof RbacError) {
      return {
        error:
          error.status === 401
            ? 'Sign in with a customer account to get a quote.'
            : 'Automated quotes are for customer accounts.',
      }
    }
    throw error
  }

  let spec: DoorSpec
  try {
    spec = parseSpec(JSON.parse(String(formData.get('spec') ?? '')))
  } catch {
    return { error: 'The design could not be read. Go back to Design and try again.' }
  }

  const key = decodeBusinessKey(String(formData.get('business') ?? ''))
  if (!key) return { error: 'Choose a company.' }

  const brandInput = String(formData.get('brand') ?? '').trim()
  if (brandInput.length > 60) return { error: 'That brand name is too long.' }
  const request = requestFromSpec(spec, {
    brand: brandInput === '' ? null : brandInput,
    installRequired: formData.get('install') !== 'supply',
  })

  let reference: string
  try {
    if (!(await businessIsSubscribed(key)))
      return { error: 'That company is not taking automated quotes right now.' }
    const card = await businessCard(key)
    if (!card) return { error: 'That company was not found.' }

    const rules = await prisma.pricingRule.findMany({
      where: { ...ruleOwnerWhere(key), product: request.product, active: true },
    })
    const result = matchRules(request, rules.map(toRuleTerms))
    if (!result.available) {
      return { unavailable: { businessKey: card.key, businessName: card.name, reason: result.reason } }
    }

    reference = await createQuote()

    // The business hears about every quote its prices produce. Only the
    // customer's first name goes with it; contact details follow a booking.
    const cheapest = result.options[0]
    await notifyBusiness(key, {
      type: NotificationType.LEAD_MATCHED,
      title: `New quote: ${productLabel(request.product)} ${request.widthMm} × ${request.heightMm} mm`,
      body: `${session.name.split(' ')[0]} was quoted ${formatMoney(cheapest.totalIncGstCents, cheapest.currency)} inc GST from your prices.`,
      href: `/quotes/${reference}`,
    })

    async function createQuote(attempt = 0): Promise<string> {
      const candidate = makeReference('QTE', 8)
      try {
        await prisma.automatedQuote.create({
          data: {
            reference: candidate,
            customerId: session.userId,
            ...(key!.kind === 'organization'
              ? { businessOrganizationId: key!.id }
              : { businessUserId: key!.id }),
            businessName: card!.name,
            product: request.product,
            productStyle: request.productStyle,
            spec: spec as unknown as Prisma.InputJsonValue,
            widthMm: request.widthMm,
            heightMm: request.heightMm,
            requestedBrand: request.brand,
            motorRequired: request.motorRequired,
            requestedMotor: request.motorBrand,
            installRequired: request.installRequired,
            options: {
              create: (result as Extract<typeof result, { available: true }>).options.map(
                (option, sortOrder) => ({
                  ruleId: option.ruleId,
                  productBrand: option.productBrand,
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
                  sortOrder,
                })
              ),
            },
          },
        })
        return candidate
      } catch (error) {
        // A reference collision is astronomically rare; one retry.
        if (attempt === 0 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return createQuote(1)
        }
        throw error
      }
    }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  redirect(`/quotes/${reference}`)
}
