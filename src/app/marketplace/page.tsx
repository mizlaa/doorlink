import type { Metadata } from 'next'
import Link from 'next/link'
import type { ListingCondition, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { NotConnected } from '@/components/ui/NotConnected'
import { Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { AddToCartButton } from '@/app/cart/AddToCartButton'
import { InterestedButton } from '@/components/marketplace/InterestedButton'

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Parts and accessories listed by other Doorlink members and businesses. Browse and buy directly.',
  // Points at the bare path regardless of which filters are applied, so
  // search engines don't treat every filter combination as separate
  // duplicate content.
  alternates: { canonical: '/marketplace' },
}

const CONDITIONS: { value: ListingCondition; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'USED', label: 'Used' },
]

type SearchParams = Promise<{
  q?: string
  categoryId?: string
  manufacturerId?: string
  condition?: string
}>

export default async function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const q = params.q?.trim() || ''
  const categoryId = params.categoryId || ''
  const manufacturerId = params.manufacturerId || ''
  const condition = CONDITIONS.some((option) => option.value === params.condition) ? params.condition : ''

  const session = await getSession()

  const filterConditions: Prisma.ListingWhereInput[] = [{ status: 'ACTIVE' }]
  if (categoryId) filterConditions.push({ model: { categoryId } })
  if (manufacturerId) filterConditions.push({ model: { manufacturerId } })
  if (condition) filterConditions.push({ condition: condition as ListingCondition })
  if (q) {
    filterConditions.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { model: { name: { contains: q, mode: 'insensitive' } } },
        { model: { modelCode: { contains: q, mode: 'insensitive' } } },
      ],
    })
  }
  const hasActiveFilters = Boolean(q || categoryId || manufacturerId || condition)

  let listings, categories, manufacturers
  try {
    ;[listings, categories, manufacturers] = await Promise.all([
      prisma.listing.findMany({
        where: { AND: filterConditions },
        orderBy: { createdAt: 'desc' },
        include: {
          model: { select: { id: true, name: true, modelCode: true } },
          organization: { select: { name: true } },
          seller: { select: { name: true } },
        },
      }),
      prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.manufacturer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-12">
        <NotConnected feature="The marketplace" reason="Can't load listings right now." />
      </div>
    )
  }

  const noListingsAtAll = listings.length === 0 && !hasActiveFilters

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <h1 className="text-2xl font-semibold text-graphite">Marketplace</h1>
      <p className="mt-2 max-w-prose text-graphite-soft">
        Parts from other members. Buy direct from the seller.
      </p>

      <form method="GET" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search title or model…"
          aria-label="Search listings"
          className="lg:col-span-2"
        />
        <Select name="categoryId" defaultValue={categoryId} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select name="manufacturerId" defaultValue={manufacturerId} aria-label="Manufacturer">
          <option value="">All manufacturers</option>
          {manufacturers.map((manufacturer) => (
            <option key={manufacturer.id} value={manufacturer.id}>
              {manufacturer.name}
            </option>
          ))}
        </Select>
        <Select name="condition" defaultValue={condition} aria-label="Condition">
          <option value="">Any condition</option>
          {CONDITIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-3 lg:col-span-5">
          <Button type="submit" size="sm">
            Filter
          </Button>
          {hasActiveFilters && (
            <Link href="/marketplace" className="text-sm font-medium text-signal hover:text-signal-hover">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {listings.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={noListingsAtAll ? 'No active listings yet' : 'No listings match your filters'}
            description={
              noListingsAtAll
                ? 'Check back once suppliers have listed products for sale.'
                : 'Try a broader search or clear some filters.'
            }
            action={
              hasActiveFilters ? (
                <Link href="/marketplace" className="mt-2 inline-block text-sm font-medium text-signal hover:text-signal-hover">
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-zinc-deep">
            {listings.length} listing{listings.length === 1 ? '' : 's'}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <Panel key={listing.id}>
                <PanelBody>
                  <p className="font-code text-sm text-zinc-deep">{listing.model.modelCode}</p>
                  <Link
                    href={`/model/${listing.model.id}`}
                    className="mt-1 block font-medium text-graphite hover:text-signal"
                  >
                    {listing.title}
                  </Link>
                  <p className="mt-1 text-sm text-zinc-deep">
                    Sold by {listing.organization?.name ?? listing.seller?.name ?? 'a Doorlink member'}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-graphite">
                    {formatMoney(listing.priceCents, listing.currency)}
                  </p>
                  <p className="mt-1 text-micro uppercase tracking-wide text-zinc-deep">
                    {listing.condition.toLowerCase()} · {listing.stockQty} in stock
                  </p>
                  <div className="mt-2">
                    <SourceBadge source={listing.dataSource} />
                  </div>
                  <div className="mt-3 flex flex-col items-start gap-2">
                    {session ? (
                      <>
                        <AddToCartButton listingId={listing.id} />
                        <InterestedButton listingId={listing.id} />
                      </>
                    ) : (
                      <Link href="/sign-in" className="text-sm font-medium text-signal hover:text-signal-hover">
                        Sign in to buy
                      </Link>
                    )}
                  </div>
                </PanelBody>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
