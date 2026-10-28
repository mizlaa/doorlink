import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatMoney } from '@/lib/money'
import {
  businessKeyFor,
  loadBusinessDetails,
  pricingSession,
  ruleOwnerWhere,
  toRuleTerms,
} from '@/lib/pricing/business'
import { sizeRangeLabel } from '@/lib/pricing/describe'
import { gstBreakdown } from '@/lib/pricing/engine'
import {
  GST_LABELS,
  INSTALLATION_LABELS,
  motorLabel,
  PRICED_PRODUCTS,
  styleLabel,
} from '@/lib/pricing/products'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PricingRuleForm } from './PricingRuleForm'
import { deleteRuleAction, toggleRuleAction } from './actions'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Automated pricing' }

type PageProps = { searchParams: Promise<{ saved?: string; overlap?: string; details?: string }> }

export default async function PricingPage({ searchParams }: PageProps) {
  const params = await searchParams
  // The layout has already gated; this re-derives the business from the
  // session so the query can only ever return this business's rules.
  const session = await pricingSession(await getSession())
  if (!session) return null
  const key = businessKeyFor(session)
  const [rules, details] = await Promise.all([
    prisma.pricingRule.findMany({
      where: ruleOwnerWhere(key),
      orderBy: [{ product: 'asc' }, { productBrand: 'asc' }, { minWidthMm: 'asc' }, { minHeightMm: 'asc' }],
    }),
    loadBusinessDetails(key),
  ])
  const detailsMissing = !details || !details.businessName || !details.phone || !details.email

  const byProduct = PRICED_PRODUCTS.map((product) => ({
    product,
    rules: rules.filter((rule) => rule.product === product.id),
  })).filter((group) => group.rules.length > 0)

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <section aria-labelledby="prices-heading" className="min-w-0">
        <h2 id="prices-heading" className="text-sm font-medium text-graphite">
          Your prices
        </h2>
        {detailsMissing && (
          <p className="mt-2 rounded-md border border-caution/30 bg-caution-tint px-3 py-2 text-sm text-graphite">
            Add your{' '}
            <Link href="/pricing/business" className="font-medium text-signal hover:text-signal-hover">
              business details
            </Link>{' '}
            so customers see your name and quote alerts reach you.
          </p>
        )}
        {params.details && <p className="mt-2 text-sm text-good">Business details saved.</p>}
        {params.saved && <p className="mt-2 text-sm text-good">Saved.</p>}
        {params.overlap && (
          <p role="alert" className="mt-2 text-sm text-bad">
            Not switched on: it would overlap your price for {params.overlap}.
          </p>
        )}

        {byProduct.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No prices yet"
              description="Add a price for a product and a range of sizes. Customers whose design falls inside it get your quote instantly."
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-8">
            {byProduct.map(({ product, rules: productRules }) => (
              <div key={product.id}>
                <h3 className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
                  {product.label}
                </h3>
                <ul className="flex flex-col gap-2">
                  {productRules.map((rule) => {
                    const terms = toRuleTerms(rule)
                    const breakdown = gstBreakdown(rule.priceCents, rule.gst)
                    const style = styleLabel(rule.productStyle)
                    return (
                      <li
                        key={rule.id}
                        className={`rounded-lg border border-line bg-paper p-4 ${rule.active ? '' : 'opacity-60'}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-graphite">
                              {[rule.productBrand ?? 'No brand named', style].filter(Boolean).join(' · ')}
                            </p>
                            <p className="mt-0.5 font-code text-sm text-graphite-soft">
                              {sizeRangeLabel(terms)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge>
                                {rule.motorIncluded
                                  ? `Motor${rule.motorBrand ? `: ${motorLabel(rule.product, rule.motorBrand)}` : ' included'}`
                                  : 'No motor'}
                              </Badge>
                              <Badge>{INSTALLATION_LABELS[rule.installation]}</Badge>
                              {!rule.active && <Badge tone="caution">Off</Badge>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-graphite">
                              {formatMoney(rule.priceCents)}
                              <span className="ml-1 text-sm font-normal text-zinc-deep">
                                {rule.gst === 'EXCLUSIVE' ? '+ GST' : 'inc GST'}
                              </span>
                            </p>
                            <p className="text-micro text-zinc-deep">
                              {rule.gst === 'EXCLUSIVE'
                                ? `${formatMoney(breakdown.totalIncGstCents)} inc GST`
                                : `${formatMoney(breakdown.subtotalExGstCents)} ex GST`}
                              {rule.installation === 'SEPARATE' && rule.installPriceCents
                                ? ` · install ${formatMoney(rule.installPriceCents)}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-sm">
                          <Link
                            href={`/pricing/${rule.id}`}
                            className="font-medium text-signal hover:text-signal-hover"
                          >
                            Edit
                          </Link>
                          <form action={toggleRuleAction}>
                            <input type="hidden" name="id" value={rule.id} />
                            <button
                              type="submit"
                              className="font-medium text-graphite-soft hover:text-graphite"
                            >
                              {rule.active ? 'Switch off' : 'Switch on'}
                            </button>
                          </form>
                          <form action={deleteRuleAction}>
                            <input type="hidden" name="id" value={rule.id} />
                            <button type="submit" className="font-medium text-bad hover:underline">
                              Delete
                            </button>
                          </form>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 text-micro text-zinc-deep">
          {GST_LABELS.EXCLUSIVE} adds 10% GST. Sizes include both ends of each range.
        </p>
      </section>

      <section
        aria-labelledby="add-heading"
        className="rounded-lg border border-line bg-paper p-5 shadow-panel lg:sticky lg:top-6 lg:self-start"
      >
        <h2 id="add-heading" className="mb-4 text-sm font-medium text-graphite">
          Add a price
        </h2>
        <PricingRuleForm />
      </section>
    </div>
  )
}
