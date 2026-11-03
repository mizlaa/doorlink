import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { NotConnected } from '@/components/ui/NotConnected'
import { ACTIVE_JOB_STATUSES, QUOTABLE_LEAD_STATUSES } from '@/lib/marketplace'
import { isDemo } from '@/lib/demo/mode'
import { ResetDemoPanel } from './demo/ResetDemoPanel'

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams
  const session = await getSession()
  // The layout has already redirected anyone without catalogue:write, so
  // a session exists here; what varies is whether it can also see the
  // marketplace, which a manufacturer cannot.
  const seesMarketplace = session ? can(session.role, 'lead:write:any') : false

  let catalogue: number[]
  let marketplace: number[] = []
  try {
    ;[catalogue, marketplace] = await Promise.all([
      Promise.all([
        prisma.manufacturer.count(),
        prisma.category.count(),
        prisma.model.count(),
        prisma.document.count(),
        prisma.compatibility.count(),
      ]),
      seesMarketplace
        ? Promise.all([
            prisma.lead.count({ where: { status: { in: QUOTABLE_LEAD_STATUSES } } }),
            prisma.job.count({ where: { status: { in: ACTIVE_JOB_STATUSES } } }),
          ])
        : Promise.resolve([]),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="The catalogue database" reason="Can't load admin stats right now." />
  }

  const [manufacturers, categories, models, documents, compatibility] = catalogue

  const catalogueStats = [
    { label: 'Manufacturers', count: manufacturers, href: '/admin/manufacturers' },
    { label: 'Categories', count: categories, href: '/admin/categories' },
    { label: 'Models', count: models, href: '/admin/models' },
    { label: 'Documents', count: documents, href: null },
    { label: 'Compatibility links', count: compatibility, href: '/admin/compatibility' },
  ]

  const marketplaceStats = seesMarketplace
    ? [
        { label: 'Open requests', count: marketplace[0], href: '/admin/marketplace' },
        { label: 'Active jobs', count: marketplace[1], href: '/admin/marketplace' },
      ]
    : []

  return (
    <div className="flex flex-col gap-10">
      {isDemo() && <ResetDemoPanel justReset={demo === 'reset'} />}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Catalogue</h2>
        <StatGrid stats={catalogueStats} />
      </section>

      {marketplaceStats.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
            Marketplace
          </h2>
          <StatGrid stats={marketplaceStats} />
        </section>
      )}
    </div>
  )
}

function StatGrid({ stats }: { stats: Array<{ label: string; count: number; href: string | null }> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <Panel key={stat.label}>
          <PanelBody>
            <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-graphite">{stat.count}</p>
            {stat.href ? (
              <Link
                href={stat.href}
                className="mt-2 inline-block text-sm font-medium text-signal hover:text-signal-hover"
              >
                Manage →
              </Link>
            ) : (
              <p className="mt-2 text-sm text-zinc-deep">Admin screen not built yet.</p>
            )}
          </PanelBody>
        </Panel>
      ))}
    </div>
  )
}
