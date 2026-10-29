import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { COMMISSION_SETTING_KEY, formatCommissionRate } from '@/lib/commission'
import { commissionExemptKeys, currentCommissionBps } from '@/lib/commission-settings'
import { businessCard, decodeBusinessKey, encodeBusinessKey } from '@/lib/pricing/business'
import { Badge } from '@/components/ui/Badge'
import { setFeeExemptAction } from './actions'
import { CommissionForm } from './CommissionForm'
import { CompliancePriceForm } from './CompliancePriceForm'
import { currentCompliancePriceCents } from '@/lib/compliance/pricing-settings'

export const metadata: Metadata = { title: 'Platform settings' }

export default async function AdminSettingsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  // The admin section as a whole is open to anyone who can edit the
  // catalogue, which includes manufacturers. This page is not.
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  let currentBps: number

  let compliancePriceCents: number
  let businesses: Array<{ key: string; name: string; exempt: boolean }>
  let history: Array<{
    id: string
    createdAt: Date
    metadata: unknown
    actor: { name: string } | null
  }>
  try {
    ;[currentBps, compliancePriceCents, history, businesses] = await Promise.all([
      currentCommissionBps(),
      currentCompliancePriceCents(),
      prisma.auditLog.findMany({
        where: {
          entityType: 'PlatformSetting',
          entityId: COMMISSION_SETTING_KEY,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { actor: { select: { name: true } } },
      }),
      feeBusinesses(),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Platform settings" reason="Can't reach the database right now." />
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">Marketplace commission</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          What Doorlink takes from each job hired from the job board or booked from an automated quote. It comes
          out of the business&apos;s side: the customer pays the quoted price and never sees the fee. Changing
          it affects jobs hired from now on: every job already accepted keeps the rate it was agreed at, because
          the rate is recorded on the transaction at the moment of hiring rather than looked up later.
        </p>
        <p className="mt-3 text-sm text-graphite">
          Currently <span className="font-medium">{formatCommissionRate(currentBps)}</span>.
        </p>

        <div className="mt-5">
          <CommissionForm currentBps={currentBps} />
        </div>
      </section>

      <section className="border-t border-line pt-10">
        <h2 className="text-lg font-semibold text-graphite">Fee-free businesses</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Businesses that pay no commission on bookings or hires, such as your own company. Only businesses with
          automated prices are listed. The fee is never shown to customers either way.
        </p>
        {businesses.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-deep">No business has published automated prices yet.</p>
        ) : (
          <ul className="mt-4 flex max-w-xl flex-col gap-2">
            {businesses.map((business) => (
              <li
                key={business.key}
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium text-graphite">
                  <span className="truncate">{business.name}</span>
                  {business.exempt ? (
                    <Badge tone="good">Fee-free</Badge>
                  ) : (
                    <Badge>{formatCommissionRate(currentBps)}</Badge>
                  )}
                </span>
                <form action={setFeeExemptAction}>
                  <input type="hidden" name="business" value={business.key} />
                  <input type="hidden" name="exempt" value={business.exempt ? '0' : '1'} />
                  <button type="submit" className="font-medium text-signal hover:text-signal-hover">
                    {business.exempt ? 'Charge the fee' : 'Make fee-free'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-line pt-10">
        <h2 className="text-lg font-semibold text-graphite">Compliance &amp; Safety Pack</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          The one-off price of the document pack add-on. Changing it affects new purchases only. The price is
          written onto a purchase when it is made, so nobody&apos;s receipt changes retrospectively.
        </p>

        <div className="mt-5">
          <CompliancePriceForm currentCents={compliancePriceCents} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Change history</h2>
        <p className="mt-1 text-sm text-graphite-soft">Every change to the commission rate, and who made it.</p>

        <div className="mt-4">
          {history.length === 0 ? (
            <EmptyState
              title="No changes recorded"
              description="The rate is still at its seeded starting value."
            />
          ) : (
            <ol className="flex flex-col gap-2">
              {history.map((entry) => {
                const meta = entry.metadata as {
                  fromBps?: number
                  toBps?: number
                } | null
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
                  >
                    <span className="text-graphite">
                      {typeof meta?.fromBps === 'number' && typeof meta?.toBps === 'number' ? (
                        <>
                          {formatCommissionRate(meta.fromBps)} →{' '}
                          <span className="font-medium">{formatCommissionRate(meta.toBps)}</span>
                        </>
                      ) : (
                        'Rate changed'
                      )}
                    </span>
                    <span className="text-micro text-zinc-deep">
                      {entry.createdAt.toLocaleString('en-AU', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {entry.actor && ` · ${entry.actor.name}`}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}

/** Businesses with automated prices, plus any already fee-free, by name. */
async function feeBusinesses(): Promise<Array<{ key: string; name: string; exempt: boolean }>> {
  const [owners, exempt] = await Promise.all([
    prisma.pricingRule.findMany({
      select: { organizationId: true, ownerId: true },
      distinct: ['organizationId', 'ownerId'],
    }),
    commissionExemptKeys(),
  ])
  const keys = new Set([
    ...owners.map((o) =>
      encodeBusinessKey(
        o.organizationId ? { kind: 'organization', id: o.organizationId } : { kind: 'user', id: o.ownerId! }
      )
    ),
    ...exempt,
  ])
  const rows = await Promise.all(
    [...keys].map(async (key) => {
      const decoded = decodeBusinessKey(key)
      const card = decoded ? await businessCard(decoded) : null
      return card ? { key, name: card.name, exempt: exempt.includes(key) } : null
    })
  )
  return rows
    .filter((row): row is { key: string; name: string; exempt: boolean } => row !== null)
    .sort((a, b) => Number(b.exempt) - Number(a.exempt) || a.name.localeCompare(b.name))
}
