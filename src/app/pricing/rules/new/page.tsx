import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { RuleForm, EMPTY_RULE } from '../../RuleForm'
import { pricingAccess } from '../../access'

// Per-user and per-business data: always rendered on request, never at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Add a price' }

export default async function NewRulePage() {
  const access = await pricingAccess('/pricing/rules/new')
  if (access.kind === 'blocked') return <div className="mx-auto max-w-shell px-4 py-10">{access.screen}</div>
  if (access.kind === 'no-business') redirect('/pricing')
  return (
    <div className="mx-auto w-full min-w-0 max-w-shell px-4 py-10 sm:py-14">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-graphite">Add a price</h1>
      <p className="mb-8 max-w-prose text-graphite-soft">
        One price for one product, brand and motor arrangement across a range of sizes. Add more prices for other sizes. Ranges for the same product, brand and motor cannot overlap, so every size has one price.
      </p>
      <RuleForm initial={EMPTY_RULE} />
    </div>
  )
}
