import { rulesConflict, type RuleTerms } from '@/lib/pricing/engine'
import { describeRule } from '@/lib/pricing/describe'
import { readRuleForm } from '@/lib/pricing/validation'
import { navigate } from '../router'
import { getDemo, makeId, update } from '../demo/store'
import { pricingBusinessFor, pricingHref } from '../demo/pricing-target'

/**
 * Demo stand-in for src/app/pricing/actions.ts. The same validation
 * (readRuleForm) and the same overlap check (rulesConflict) as the real
 * actions, writing to this browser's demo store instead of the database.
 */

export type RuleFormState = { error?: string }

function gate(): { companyId: string } | { error: string } {
  const session = getDemo().session
  if (!session) return { error: 'Sign in to manage prices.' }
  const companyId = pricingBusinessFor(session)
  if (!companyId) return { error: 'Only technician and supplier accounts can set automated prices.' }
  return { companyId }
}

export async function saveRuleAction(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const access = gate()
  if ('error' in access) return access
  const validation = readRuleForm(formData)
  if (!validation.ok) return { error: validation.error }
  const id = String(formData.get('id') ?? '') || null
  const own = getDemo().rules[access.companyId] ?? []
  if (id && !own.some((rule) => rule.id === id)) return { error: 'That price was not found.' }

  const candidate: RuleTerms = { ...validation.data, id: id ?? '__new__', currency: 'AUD' }
  const clash = own.find((rule) => rulesConflict(candidate, rule))
  if (clash) {
    return {
      error: `This overlaps one of your existing prices (${describeRule(clash)}). Ranges include both ends, so start the next range one millimetre higher, or edit that price instead.`,
    }
  }

  update((s) => {
    const list = (s.rules[access.companyId] ??= [])
    if (id) {
      const index = list.findIndex((rule) => rule.id === id)
      list[index] = { ...candidate, id }
    } else {
      list.push({ ...candidate, id: `${access.companyId}-${makeId('r')}` })
    }
  })
  navigate(pricingHref(getDemo().session, '/pricing?saved=1'))
  return {}
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const access = gate()
  if ('error' in access) return
  const id = String(formData.get('id') ?? '')
  update((s) => {
    s.rules[access.companyId] = (s.rules[access.companyId] ?? []).filter((rule) => rule.id !== id)
  })
}

/** Returns the clashing price's description when switching it back on would overlap. */
export async function toggleRuleAction(formData: FormData): Promise<string | null> {
  const access = gate()
  if ('error' in access) return null
  const id = String(formData.get('id') ?? '')
  const own = getDemo().rules[access.companyId] ?? []
  const rule = own.find((r) => r.id === id)
  if (!rule) return null
  if (!rule.active) {
    const clash = own.find((other) => rulesConflict({ ...rule, active: true }, other))
    if (clash) return describeRule(clash)
  }
  update((s) => {
    const target = s.rules[access.companyId]?.find((r) => r.id === id)
    if (target) target.active = !target.active
  })
  return null
}
