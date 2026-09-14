import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { formatMoney } from '@/lib/money'
import { platformMetrics } from '@/lib/metrics'
import { paymentsAvailable } from '@/lib/payments'
import { NotConnected } from '@/components/ui/NotConnected'
import { Panel, PanelBody } from '@/components/ui/Panel'

export const metadata: Metadata = { title: 'Metrics' }

export default async function AdminMetricsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  const metrics = await platformMetrics()
  if (!metrics) {
    return <NotConnected feature="Metrics" reason="Can't reach the database right now." />
  }

  const live = paymentsAvailable()

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">People</h2>
        <Grid>
          <Figure label="Users" value={metrics.users.total} />
          <Figure label="Customers" value={metrics.users.customers} />
          <Figure label="Technicians" value={metrics.users.technicians} />
          <Figure label="Admins" value={metrics.users.admins} />
        </Grid>
        <Grid className="mt-4">
          <Figure
            label="Trade profiles"
            value={metrics.workers.withProfiles}
            detail="Technicians who have filled one in"
          />
          <Figure
            label="Verified"
            value={metrics.workers.verified}
            detail="An admin checked their licence details"
          />
          <Figure label="Taking work" value={metrics.workers.acceptingWork} detail="Available right now" />
        </Grid>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Marketplace</h2>
        <Grid>
          <Figure label="Requests posted" value={metrics.marketplace.leadsTotal} />
          <Figure label="Open for quotes" value={metrics.marketplace.leadsOpen} />
          <Figure label="Quotes sent" value={metrics.marketplace.quotesTotal} />
          <Figure label="Jobs active" value={metrics.marketplace.jobsActive} />
          <Figure label="Jobs completed" value={metrics.marketplace.jobsCompleted} />
          <Figure
            label="Disputed"
            value={metrics.marketplace.jobsDisputed}
            href={metrics.marketplace.jobsDisputed > 0 ? '/admin/disputes' : undefined}
          />
        </Grid>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Money</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          <strong className="font-medium text-graphite">Recorded</strong> is what Doorlink wrote down when a job
          was agreed. <strong className="font-medium text-graphite">Collected</strong> is money a payment
          provider has confirmed.{' '}
          {live
            ? 'Both are real figures.'
            : 'No provider is connected, so collected is zero — that is the true answer, not a broken one.'}
        </p>

        <Grid className="mt-5">
          <Figure
            label="Recorded GMV"
            value={formatMoney(metrics.money.recordedGmvCents)}
            detail="On completed jobs"
          />
          <Figure
            label="Recorded commission"
            value={formatMoney(metrics.money.recordedCommissionCents)}
            detail="Doorlink's share of the above"
          />
          <Figure
            label="Collected GMV"
            value={formatMoney(metrics.money.collectedGmvCents)}
            detail={live ? 'Confirmed by the provider' : 'No provider connected'}
          />
          <Figure
            label="Collected commission"
            value={formatMoney(metrics.money.collectedCommissionCents)}
            detail={live ? 'Doorlink revenue' : 'No provider connected'}
          />
          <Figure label="Paid out" value={formatMoney(metrics.money.paidOutCents)} detail="To technicians" />
          <Figure
            label="Owed to technicians"
            value={formatMoney(metrics.money.owedToWorkersCents)}
            detail="Confirmed paid, not yet transferred"
          />
        </Grid>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Subscriptions</h2>
        <Grid>
          <Figure label="Active" value={metrics.subscriptions.active} href="/admin/subscriptions" />
          <Figure label="All time" value={metrics.subscriptions.total} />
        </Grid>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Community</h2>
        <Grid>
          <Figure label="Reviews" value={metrics.community.reviews} />
          <Figure
            label="Average rating"
            // No reviews is not an average of nought.
            value={metrics.community.averageRating?.toFixed(2) ?? '—'}
            detail={metrics.community.averageRating === null ? 'No reviews yet' : 'Across all reviews'}
          />
          <Figure
            label="Open reports"
            value={metrics.community.openReports}
            href={metrics.community.openReports > 0 ? '/admin/reports' : undefined}
          />
          <Figure
            label="Open disputes"
            value={metrics.community.openDisputes}
            href={metrics.community.openDisputes > 0 ? '/admin/disputes' : undefined}
          />
        </Grid>
      </section>
    </div>
  )
}

function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ''}`}>{children}</div>
}

function Figure({
  label,
  value,
  detail,
  href,
}: {
  label: string
  value: string | number
  detail?: string
  href?: string
}) {
  const body = (
    <PanelBody>
      <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-graphite">{value}</p>
      {detail && <p className="mt-1 text-micro text-zinc-deep">{detail}</p>}
    </PanelBody>
  )

  if (!href) return <Panel>{body}</Panel>

  return (
    <Link href={href} className="block transition-colors [&>*]:hover:border-signal">
      <Panel>{body}</Panel>
    </Link>
  )
}
