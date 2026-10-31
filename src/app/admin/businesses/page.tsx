import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { BusinessStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { businessCard, businessIsSubscribed, decodeBusinessKey, ruleOwnerWhere } from '@/lib/pricing/business'
import { formatRange } from '@/lib/business/coverage'
import { productLabel } from '@/lib/pricing/products'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { setBusinessStatusAction } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Businesses' }

const FILTERS: Array<{ id: BusinessStatus | 'ALL'; label: string }> = [
  { id: 'PENDING', label: 'Awaiting approval' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'SUSPENDED', label: 'Suspended' },
  { id: 'ALL', label: 'All' },
]

const TONE = { PENDING: 'caution', APPROVED: 'good', SUSPENDED: 'bad' } as const

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')
  const wanted = (await searchParams).status
  const status = (FILTERS.find((f) => f.id === wanted)?.id ?? 'PENDING') as BusinessStatus | 'ALL'

  const profiles = await prisma.businessProfile.findMany({
    where: status === 'ALL' ? {} : { status },
    orderBy: { updatedAt: 'desc' },
    include: { serviceAreas: true },
    take: 200,
  })
  const rows = await Promise.all(
    profiles.map(async (profile) => {
      const key = decodeBusinessKey(profile.businessKey)!
      const [card, subscribed, prices] = await Promise.all([
        businessCard(key),
        businessIsSubscribed(key),
        prisma.pricingRule.count({ where: { ...ruleOwnerWhere(key), active: true } }),
      ])
      return { profile, card, subscribed, prices }
    })
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-graphite">Businesses</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Only approved businesses with an active subscription are quoted to customers and can take bookings.
          Suspending one hides it immediately; its existing jobs carry on.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filter">
        {FILTERS.map((filter) => (
          <Link
            key={filter.id}
            href={`/admin/businesses?status=${filter.id}`}
            className={`rounded-full border px-3 py-1 ${filter.id === status ? 'border-signal bg-signal text-paper' : 'border-line bg-paper text-graphite'}`}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" description="No businesses with this status." />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ profile, card, subscribed, prices }) => (
            <li key={profile.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-graphite">
                    {card?.name ?? profile.businessKey}
                    <Badge tone={TONE[profile.status]}>{profile.status.toLowerCase()}</Badge>
                  </p>
                  <p className="mt-1 text-sm text-zinc-deep">
                    {subscribed ? 'Subscribed' : 'No active subscription'} · {prices} active price
                    {prices === 1 ? '' : 's'} ·{' '}
                    {profile.serviceAreas.length > 0
                      ? `serves ${profile.serviceAreas.slice(0, 4).map(formatRange).join(', ')}${profile.serviceAreas.length > 4 ? '…' : ''}`
                      : 'no service area'}{' '}
                    · {profile.stripeChargesEnabled ? 'online payments on' : 'no online payments'}
                  </p>
                  {profile.products.length > 0 && (
                    <p className="mt-1 text-sm text-zinc-deep">{profile.products.map(productLabel).join(', ')}</p>
                  )}
                  {profile.statusNote && <p className="mt-1 text-sm text-graphite-soft">Note: {profile.statusNote}</p>}
                  <Link
                    href={`/businesses/${profile.businessKey}`}
                    className="mt-1 inline-block text-sm font-medium text-signal hover:text-signal-hover"
                  >
                    View profile
                  </Link>
                </div>
                <form action={setBusinessStatusAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="businessKey" value={profile.businessKey} />
                  <input
                    name="note"
                    placeholder="Note to the business (optional)"
                    maxLength={500}
                    className="h-9 w-56 rounded-md border border-line bg-paper px-2 text-sm"
                    aria-label={`Note for ${card?.name ?? 'business'}`}
                  />
                  {profile.status !== 'APPROVED' && (
                    <button name="status" value="APPROVED" className="h-9 rounded-md bg-signal px-3 text-sm font-semibold text-paper">
                      Approve
                    </button>
                  )}
                  {profile.status !== 'SUSPENDED' && (
                    <button name="status" value="SUSPENDED" className="h-9 rounded-md border border-bad/40 px-3 text-sm font-semibold text-bad">
                      Suspend
                    </button>
                  )}
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
