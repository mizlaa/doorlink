import 'server-only'

import type { AutomatedQuote, AutomatedQuoteOption } from '@prisma/client'
import type { Session } from '@/lib/auth'
import { estimateFor, requirementFor } from '@/lib/configurator/estimate'
import { parseSpec } from '@/lib/configurator/options'
import { loadMotorCandidates } from '@/lib/motors/catalogue'
import { recommendMotors } from '@/lib/motors/specs'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/rbac'
import { motorLabel } from './products'

export type QuoteWithOptions = AutomatedQuote & { options: AutomatedQuoteOption[] }

/**
 * Who may open a quote: the customer it was issued to, and the business
 * that issued it — nobody else, platform admins included. Anyone else
 * gets the same "not found" as a reference that does not exist, so a
 * guessed reference reveals nothing.
 */
export function canViewQuote(
  session: Session | null,
  quote: Pick<AutomatedQuote, 'customerId' | 'businessOrganizationId' | 'businessUserId'>
): boolean {
  if (!session) return false
  if (quote.customerId === session.userId) return true
  if (!can(session.role, 'pricing:write:own')) return false
  if (quote.businessOrganizationId) return session.organizationId === quote.businessOrganizationId
  return quote.businessUserId === session.userId && !session.organizationId
}

export async function quoteForViewer(
  reference: string,
  session: Session | null
): Promise<QuoteWithOptions | null> {
  if (!session || !/^DL-QTE-[0-9A-Z]{6,12}$/.test(reference)) return null
  const quote = await prisma.automatedQuote.findUnique({
    where: { reference },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!quote || !canViewQuote(session, quote)) return null
  return quote
}

export type MotorCheck =
  | { kind: 'none' }
  | { kind: 'unnamed' }
  | { kind: 'rated'; brand: string; models: string[] }
  | { kind: 'not-rated'; brand: string }
  | { kind: 'no-data'; brand: string }

/**
 * What Doorlink's motor catalogue says about the motor on an option. It
 * never decides compatibility on its own: a brand with a rated model is
 * shown as such, a brand with none rated for the estimated weight is
 * flagged for the business to confirm, and products with no published
 * rating data say so rather than guessing.
 */
export async function motorCheck(quote: QuoteWithOptions, option: AutomatedQuoteOption): Promise<MotorCheck> {
  if (!option.motorIncluded) return { kind: 'none' }
  if (!option.motorBrand) return { kind: 'unnamed' }
  const brand = motorLabel(quote.product, option.motorBrand) ?? option.motorBrand
  const spec = parseSpec(quote.spec)
  const requirement = requirementFor(spec)
  if (!requirement || !estimateFor(spec)) return { kind: 'no-data', brand }
  const motors = await loadMotorCandidates()
  const matches = recommendMotors(requirement, motors, { brand: option.motorBrand, limit: 3 })
  if (matches.length === 0) return { kind: 'not-rated', brand }
  return { kind: 'rated', brand, models: matches.map((m) => m.motor.modelCode) }
}
