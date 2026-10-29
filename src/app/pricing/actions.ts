'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { prisma } from '@/lib/prisma'
import { RbacError } from '@/lib/rbac'
import { isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'
import {
  businessKeyFor,
  requirePricingAccess,
  ruleOwnerData,
  ruleOwnerWhere,
  toRuleTerms,
  type BusinessKey,
} from '@/lib/pricing/business'
import { describeRule } from '@/lib/pricing/describe'
import { rulesConflict, type RuleTerms } from '@/lib/pricing/engine'
import { readRuleForm } from '@/lib/pricing/validation'

export type RuleFormState = { error?: string }

/**
 * Every action re-checks who is calling: a technician or supplier with a
 * live trade subscription, acting on their own business's rules only.
 * Ownership is part of every query's WHERE clause, so a rule id from
 * another business simply is not found — the page that rendered the form
 * is never trusted to have checked.
 */
async function gate(): Promise<{ key: BusinessKey } | { error: string }> {
  try {
    const session = await requirePricingAccess(await getSession())
    return { key: businessKeyFor(session) }
  } catch (error) {
    if (error instanceof RbacError) {
      return {
        error:
          error.status === 401
            ? 'Sign in to manage prices.'
            : 'Only technician and supplier accounts can set automated prices.',
      }
    }
    if (isTradeSubscriptionRequiredError(error)) return { error: error.message }
    throw error
  }
}

class ConflictError extends Error {}
class NotFoundError extends Error {}

export async function saveRuleAction(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const access = await gate()
  if ('error' in access) return access
  const { key } = access

  const validation = readRuleForm(formData)
  if (!validation.ok) return { error: validation.error }
  const input = validation.data
  const id = typeof formData.get('id') === 'string' && formData.get('id') ? String(formData.get('id')) : null

  try {
    // Serializable, so two saves at once cannot both slip an overlapping
    // range past the conflict check.
    await prisma.$transaction(
      async (tx) => {
        const own = await tx.pricingRule.findMany({ where: ruleOwnerWhere(key) })
        if (id && !own.some((rule) => rule.id === id)) throw new NotFoundError()

        const candidate: RuleTerms = { ...input, id: id ?? '__new__', currency: 'AUD' }
        const clash = own.map(toRuleTerms).find((rule) => rulesConflict(candidate, rule))
        if (clash) throw new ConflictError(describeRule(clash))

        if (id) {
          const updated = await tx.pricingRule.updateMany({
            where: { id, ...ruleOwnerWhere(key) },
            data: input,
          })
          if (updated.count !== 1) throw new NotFoundError()
        } else {
          await tx.pricingRule.create({ data: { ...input, currency: 'AUD', ...ruleOwnerData(key) } })
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  } catch (error) {
    if (error instanceof NotFoundError) return { error: 'That price was not found.' }
    if (error instanceof ConflictError) {
      return {
        error: `This overlaps one of your existing prices (${error.message}). Ranges include both ends, so start the next range one millimetre higher, or edit that price instead.`,
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return { error: 'Another change was saved at the same moment. Please try again.' }
    }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }

  revalidatePath('/pricing')
  redirect('/pricing?saved=1')
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const access = await gate()
  if ('error' in access) redirect('/pricing')
  const id = String(formData.get('id') ?? '')
  // Issued quotes keep their own copy of the price, so deleting a rule
  // never changes a quote a customer already holds.
  await prisma.pricingRule.deleteMany({ where: { id, ...ruleOwnerWhere(access.key) } })
  revalidatePath('/pricing')
  redirect('/pricing')
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const access = await gate()
  if ('error' in access) redirect('/pricing')
  const id = String(formData.get('id') ?? '')
  const { key } = access
  let message: string | null = null

  await prisma.$transaction(
    async (tx) => {
      const own = await tx.pricingRule.findMany({ where: ruleOwnerWhere(key) })
      const rule = own.find((r) => r.id === id)
      if (!rule) return
      if (!rule.active) {
        // Switching a price back on must not create an overlap either.
        const candidate = { ...toRuleTerms(rule), active: true }
        const clash = own.map(toRuleTerms).find((other) => rulesConflict(candidate, other))
        if (clash) {
          message = describeRule(clash)
          return
        }
      }
      await tx.pricingRule.updateMany({ where: { id, ...ruleOwnerWhere(key) }, data: { active: !rule.active } })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )

  revalidatePath('/pricing')
  redirect(message ? `/pricing?overlap=${encodeURIComponent(message)}` : '/pricing')
}
