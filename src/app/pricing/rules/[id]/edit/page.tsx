import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getOwnRule } from '@/lib/quoting/company'
import { RuleForm } from '../../../RuleForm'
import { pricingAccess } from '../../../access'

// Per-user and per-business data: always rendered on request, never at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Edit price' }

const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2))

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await pricingAccess(`/pricing/rules/${id}/edit`)
  if (access.kind === 'blocked') return <div className="mx-auto max-w-shell px-4 py-10">{access.screen}</div>
  if (access.kind === 'no-business') redirect('/pricing')
  // Scoped to the signed-in user's business: another business's rule id is simply not found.
  const rule = await getOwnRule(access.ctx, id)
  if (!rule) notFound()
  return (
    <div className="mx-auto w-full min-w-0 max-w-shell px-4 py-10 sm:py-14">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-graphite">Edit price</h1>
      <p className="mb-8 max-w-prose text-graphite-soft">Changes apply to new quotes. Quotes customers already have keep the price they were given.</p>
      <RuleForm
        initial={{
          id: rule.id, category: rule.category, brand: rule.brand ?? '', widthMinMm: String(rule.widthMinMm), widthMaxMm: String(rule.widthMaxMm),
          heightMinMm: String(rule.heightMinMm), heightMaxMm: String(rule.heightMaxMm), motorIncluded: rule.motorIncluded, motorBrand: rule.motorBrand ?? '',
          installation: rule.installation, installPrice: dollars(rule.installPriceCents), price: dollars(rule.priceCents), gst: rule.gst, notes: rule.notes ?? '',
        }}
      />
    </div>
  )
}
