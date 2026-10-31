import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { businessKeyFor, pricingSession, ruleOwnerWhere } from '@/lib/pricing/business'
import { PricingRuleForm } from '../PricingRuleForm'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Edit price' }

function dollars(cents: number | null): string {
  if (cents === null) return ''
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}

export default async function EditPricePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await pricingSession(await getSession())
  if (!session) return null
  // Scoped to this business: another business's rule id is simply "not found".
  const rule = await prisma.pricingRule.findFirst({ where: { id, ...ruleOwnerWhere(businessKeyFor(session)) } })
  if (!rule) notFound()

  return (
    <section className="max-w-2xl rounded-lg border border-line bg-paper p-5 shadow-panel">
      <h2 className="mb-4 text-sm font-medium text-graphite">Edit price</h2>
      <PricingRuleForm
        initial={{
          id: rule.id,
          product: rule.product,
          productStyle: rule.productStyle ?? '',
          productBrand: rule.productBrand ?? '',
          productModel: rule.productModel ?? '',
          material: rule.material ?? '',
          priceType: rule.priceType,
          motorIncluded: rule.motorIncluded,
          motorBrand: rule.motorBrand ?? '',
          motorAddOn: dollars(rule.motorAddOnCents),
          installation: rule.installation,
          installPrice: dollars(rule.installPriceCents),
          minWidthMm: String(rule.minWidthMm),
          maxWidthMm: String(rule.maxWidthMm),
          minHeightMm: String(rule.minHeightMm),
          maxHeightMm: String(rule.maxHeightMm),
          price: dollars(rule.priceCents),
          gst: rule.gst,
          note: rule.note ?? '',
          active: rule.active,
        }}
      />
    </section>
  )
}
