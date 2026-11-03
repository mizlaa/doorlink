import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { JobStatus as PrismaJobStatus } from '@prisma/client'
import { can, type Permission } from '@/lib/rbac'
import { formatMoney } from '@/lib/money'
import { calculateSplit, DEFAULT_COMMISSION_BPS, formatCommissionRate } from '@/lib/commission'
import { sizeRangeLabel } from '@/lib/pricing/describe'
import { gstBreakdown } from '@/lib/pricing/engine'
import { INSTALLATION_LABELS, productLabel, styleLabel } from '@/lib/pricing/products'
import { JOB_STATUS_LABELS, JOB_STATUS_TONE } from '@/lib/labels'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Select } from '@/components/ui/Field'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Table, Td, Th } from '@/components/ui/Table'
import { navigate } from '../router'
import { resetDemo, signInAs, update, useDemo, type DemoSession } from '../demo/store'
import { BRANDS, COMPANIES, companyById, DEMO_ACCOUNTS, PRODUCT_CATEGORIES, SEED_MANUALS } from '../demo/data'
import { FINDER_MODELS } from '../demo/catalogue'
import { businessCard, reviewsFor } from '../demo/cards'
import { DemoTag, SignInPrompt } from './shared'

/* Mirrors src/app/admin/layout.tsx: catalogue screens are open to
   manufacturers too; marketplace and business screens are staff only. */
const ADMIN_NAV: Array<{ href: string; label: string; permission?: Permission }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/manufacturers', label: 'Manufacturers' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/models', label: 'Models' },
  { href: '/admin/manuals', label: 'Manual library' },
  { href: '/admin/manual-submissions', label: 'Manual submissions' },
  { href: '/admin/marketplace', label: 'Marketplace', permission: 'lead:write:any' },
  { href: '/admin/businesses', label: 'Businesses', permission: 'admin:settings' },
  { href: '/admin/pricing', label: 'Price rules', permission: 'admin:settings' },
  { href: '/admin/reviews', label: 'Reviews', permission: 'admin:settings' },
  { href: '/admin/users', label: 'Users', permission: 'admin:settings' },
  { href: '/admin/metrics', label: 'Metrics', permission: 'admin:settings' },
  { href: '/admin/settings', label: 'Settings', permission: 'admin:settings' },
]

function AdminShell({ children, permission }: { children: (session: DemoSession) => ReactNode; permission?: Permission }) {
  const session = useDemo((s) => s.session)
  if (!session) return <SignInPrompt next="/admin" title="Sign in to the admin area" />
  if (!can(session.role, 'catalogue:write') || (permission && !can(session.role, permission))) {
    return (
      <div className="mx-auto max-w-prose px-4 py-16">
        <h1 className="text-xl font-semibold text-graphite">This area is for Doorlink staff</h1>
        <p className="mt-2 text-sm text-graphite-soft">
          Use the demo admin account to see it: <span className="font-code">admin@demo.doorlink.test</span> from the{' '}
          <Link href="/sign-in" className="font-medium text-signal hover:text-signal-hover">
            sign-in page
          </Link>
          .
        </p>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <div className="mb-8 flex flex-col gap-1 border-b border-line pb-6">
        <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Admin</p>
        <h1 className="text-2xl font-semibold text-graphite">Administration</h1>
      </div>
      <div className="flex flex-col gap-8 lg:flex-row">
        <nav className="flex shrink-0 flex-row flex-wrap gap-2 lg:w-48 lg:flex-col lg:flex-nowrap" aria-label="Admin">
          {ADMIN_NAV.filter((item) => !item.permission || can(session.role, item.permission)).map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-3 py-2 text-sm font-medium text-graphite hover:bg-rail">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children(session)}</div>
      </div>
    </div>
  )
}

function StatGrid({ stats }: { stats: Array<{ label: string; count: number | string; href: string | null }> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <Panel key={stat.label}>
          <PanelBody>
            <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-graphite">{stat.count}</p>
            {stat.href && (
              <Link href={stat.href} className="mt-2 inline-block text-sm font-medium text-signal hover:text-signal-hover">
                Manage →
              </Link>
            )}
          </PanelBody>
        </Panel>
      ))}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-deep">{children}</h2>
}

export function ResetDemoPanel() {
  const [done, setDone] = useState(false)
  return (
    <Panel>
      <PanelBody>
        <h2 className="text-sm font-medium text-graphite">Demo data</h2>
        <p className="mt-1 text-sm text-graphite-soft">
          Reset to restore the fictional businesses, accounts, prices and reviews, and clear anything added in this browser. You stay signed in.
        </p>
        {done && <p className="mt-2 text-sm text-good">Demo data has been reset.</p>}
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              resetDemo()
              setDone(true)
            }}
          >
            Reset demo data
          </Button>
        </div>
      </PanelBody>
    </Panel>
  )
}

export function AdminOverviewPage() {
  const state = useDemo((s) => s)
  return (
    <AdminShell>
      {(session) => {
        const seesMarketplace = can(session.role, 'lead:write:any')
        const manualsByModel = new Set(SEED_MANUALS.map((m) => m.model))
        return (
          <div className="flex flex-col gap-10">
            {session.role === 'ADMIN' && <ResetDemoPanel />}
            <section>
              <SectionTitle>Catalogue</SectionTitle>
              <StatGrid
                stats={[
                  { label: 'Manufacturers', count: BRANDS.length, href: '/admin/manufacturers' },
                  { label: 'Categories', count: PRODUCT_CATEGORIES.length, href: '/admin/categories' },
                  { label: 'Models', count: FINDER_MODELS.length, href: '/admin/models' },
                  { label: 'Documents', count: SEED_MANUALS.length, href: '/admin/manuals' },
                  { label: 'Models with a manual', count: FINDER_MODELS.filter((m) => manualsByModel.has(m.modelCode)).length, href: '/admin/models' },
                  {
                    label: 'Manual submissions waiting',
                    count: state.manualSubmissions.filter((m) => (m.status ?? 'PENDING') === 'PENDING').length,
                    href: '/admin/manual-submissions',
                  },
                ]}
              />
            </section>
            {seesMarketplace && (
              <section>
                <SectionTitle>Marketplace</SectionTitle>
                <StatGrid
                  stats={[
                    { label: 'Open requests', count: state.leads.filter((l) => l.status === 'Open' || l.status === 'Quoted').length, href: '/admin/marketplace' },
                    {
                      label: 'Active jobs',
                      count: state.jobs.filter((j) => !['COMPLETED', 'CANCELLED', 'DECLINED'].includes(j.status)).length,
                      href: '/admin/marketplace',
                    },
                    { label: 'Quotes issued', count: state.quotes.length, href: '/admin/metrics' },
                    { label: 'Businesses', count: COMPANIES.length, href: '/admin/businesses' },
                    { label: 'Listings', count: state.listings.length, href: '/marketplace' },
                    { label: 'Reviews', count: state.reviews.length + state.jobs.filter((j) => j.review).length, href: '/admin/reviews' },
                  ]}
                />
              </section>
            )}
          </div>
        )
      }}
    </AdminShell>
  )
}

export function AdminManufacturersPage() {
  return (
    <AdminShell>
      {() => (
        <section>
          <SectionTitle>Manufacturers ({BRANDS.length})</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Brand</Th>
                <Th>Models</Th>
                <Th>Manuals</Th>
                <Th>Made or stocked by</Th>
              </tr>
            </thead>
            <tbody>
              {BRANDS.map((brand) => (
                <tr key={brand}>
                  <Td className="font-medium">{brand}</Td>
                  <Td>{FINDER_MODELS.filter((m) => m.brand === brand).length}</Td>
                  <Td>{SEED_MANUALS.filter((m) => m.brand === brand).length}</Td>
                  <Td>
                    {COMPANIES.filter((c) => c.brand === brand)
                      .map((c) => c.name)
                      .join(', ') || '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-micro text-zinc-deep">Fictional brands for the demo.</p>
        </section>
      )}
    </AdminShell>
  )
}

export function AdminCategoriesPage() {
  return (
    <AdminShell>
      {() => (
        <section>
          <SectionTitle>Categories ({PRODUCT_CATEGORIES.length})</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Models</Th>
                <Th>Listings</Th>
              </tr>
            </thead>
            <tbody>
              {PRODUCT_CATEGORIES.map((category) => (
                <CategoryRow key={category} category={category} />
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </AdminShell>
  )
}

function CategoryRow({ category }: { category: string }) {
  const listings = useDemo((s) => s.listings)
  return (
    <tr>
      <Td className="font-medium">
        <Link href={`/find?category=${encodeURIComponent(category)}`} className="hover:text-signal">
          {category}
        </Link>
      </Td>
      <Td>{FINDER_MODELS.filter((m) => m.category === category).length}</Td>
      <Td>{listings.filter((l) => l.category === category).length}</Td>
    </tr>
  )
}

export function AdminModelsPage() {
  const [query, setQuery] = useState('')
  return (
    <AdminShell>
      {(session) => {
        const own = session.role === 'MANUFACTURER' ? companyById(session.companyId ?? '')?.brand : null
        const q = query.trim().toLowerCase()
        const models = FINDER_MODELS.filter((m) => !q || `${m.brand} ${m.name} ${m.modelCode} ${m.category}`.toLowerCase().includes(q))
        return (
          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Models ({models.length})</h2>
              <Input aria-label="Search models" placeholder="Search brand, model or code" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:w-72" />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Model</Th>
                  <Th>Brand</Th>
                  <Th>Category</Th>
                  <Th>Manuals</Th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className={own && m.brand === own ? 'bg-signal-tint' : undefined}>
                    <Td className="font-code">{m.modelCode}</Td>
                    <Td>
                      <Link href={`/model/${m.id}`} className="font-medium hover:text-signal">
                        {m.name}
                      </Link>
                    </Td>
                    <Td>{m.brand}</Td>
                    <Td>{m.category}</Td>
                    <Td>{SEED_MANUALS.filter((x) => x.model === m.modelCode).length}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {own && <p className="mt-3 text-micro text-zinc-deep">Highlighted: your brand ({own}).</p>}
          </section>
        )
      }}
    </AdminShell>
  )
}

export function AdminManualsPage() {
  return (
    <AdminShell>
      {() => (
        <section>
          <SectionTitle>Manual library ({SEED_MANUALS.length})</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Brand</Th>
                <Th>Model</Th>
                <Th>Type</Th>
                <Th>Pages</Th>
              </tr>
            </thead>
            <tbody>
              {SEED_MANUALS.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <Link href={`/manuals/${m.slug}`} className="font-medium hover:text-signal">
                      {m.title}
                    </Link>
                  </Td>
                  <Td>{m.brand}</Td>
                  <Td className="font-code">{m.model}</Td>
                  <Td>{m.kind}</Td>
                  <Td>{m.pages}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-micro text-zinc-deep">Sample manuals written for the demo. Not real product documentation.</p>
        </section>
      )}
    </AdminShell>
  )
}

export function AdminManualSubmissionsPage() {
  const submissions = useDemo((s) => s.manualSubmissions)
  const setStatus = (id: string, status: 'APPROVED' | 'REJECTED') =>
    update((s) => {
      const target = s.manualSubmissions.find((m) => m.id === id)
      if (target) target.status = status
    })
  return (
    <AdminShell>
      {() => (
        <section>
          <SectionTitle>Manual submissions ({submissions.length})</SectionTitle>
          {submissions.length === 0 ? (
            <EmptyState title="Nothing to review" description="Manuals sent in from the Manuals page appear here." />
          ) : (
            <ul className="flex flex-col gap-3">
              {submissions.map((m) => {
                const status = m.status ?? 'PENDING'
                return (
                  <li key={m.id} className="rounded-lg border border-line bg-paper p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-graphite">
                          {m.brand} <span className="font-code">{m.model}</span>
                        </p>
                        <p className="text-sm text-zinc-deep">
                          {m.fileName} · {m.submittedBy ?? 'Demo visitor'} · {new Date(m.at).toLocaleDateString('en-AU')}
                        </p>
                      </div>
                      <Badge tone={status === 'APPROVED' ? 'good' : status === 'REJECTED' ? 'neutral' : 'caution'}>
                        {status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Waiting for review'}
                      </Badge>
                    </div>
                    {status === 'PENDING' && (
                      <div className="mt-3 flex gap-3 border-t border-line pt-3">
                        <Button type="button" size="sm" onClick={() => setStatus(m.id, 'APPROVED')}>
                          Approve
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setStatus(m.id, 'REJECTED')}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-3 text-micro text-zinc-deep">Demo: files are not uploaded anywhere; only the file name is kept in this browser.</p>
        </section>
      )}
    </AdminShell>
  )
}

export function AdminMarketplacePage() {
  const leads = useDemo((s) => s.leads)
  const jobs = useDemo((s) => s.jobs)
  return (
    <AdminShell permission="lead:write:any">
      {() => (
        <div className="flex flex-col gap-10">
          <section>
            <SectionTitle>Requests ({leads.length})</SectionTitle>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Job</Th>
                  <Th>Where</Th>
                  <Th>Quotes</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.reference}>
                    <Td className="font-code">{l.reference}</Td>
                    <Td>{l.title}</Td>
                    <Td>
                      {l.suburb} {l.postcode}
                    </Td>
                    <Td>{l.responses.length}</Td>
                    <Td>
                      <Badge tone={l.status === 'Open' ? 'signal' : l.status === 'Quoted' ? 'caution' : l.status === 'Scheduled' ? 'good' : 'neutral'}>
                        {l.status}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
          <section>
            <SectionTitle>Work orders ({jobs.length})</SectionTitle>
            {jobs.length === 0 ? (
              <EmptyState title="No bookings yet" description="Bookings appear when a customer books a quote or accepts a technician's quote." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Job</Th>
                    <Th>Business</Th>
                    <Th>Customer</Th>
                    <Th>Price</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <Td>
                        <Link href={`/jobs/${j.id}`} className="font-code text-signal hover:text-signal-hover">
                          {j.reference}
                        </Link>
                      </Td>
                      <Td>{companyById(j.companyId)?.name}</Td>
                      <Td>{j.customerName}</Td>
                      <Td>{formatMoney(j.agreedPriceCents)}</Td>
                      <Td>
                        <Badge tone={JOB_STATUS_TONE[j.status as PrismaJobStatus]}>{JOB_STATUS_LABELS[j.status as PrismaJobStatus]}</Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  )
}

export function AdminBusinessesPage() {
  const state = useDemo((s) => s)
  const setStatus = (id: string, status: 'APPROVED' | 'PENDING' | 'SUSPENDED') =>
    update((s) => {
      s.businessStatus[id] = status
    })
  return (
    <AdminShell permission="admin:settings">
      {() => (
        <section>
          <SectionTitle>Businesses ({COMPANIES.length})</SectionTitle>
          <p className="mb-4 text-sm text-graphite-soft">Suspended or pending businesses drop out of customer comparisons straight away.</p>
          <ul className="flex flex-col gap-3">
            {COMPANIES.map((c) => {
              const status = state.businessStatus[c.id] ?? 'APPROVED'
              const card = businessCard(c.id, state)
              const prices = (state.rules[c.id] ?? []).filter((r) => r.active).length
              return (
                <li key={c.id} className="rounded-lg border border-line bg-paper p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/businesses/${c.id}`} className="font-medium text-graphite hover:text-signal">
                        {c.name}
                      </Link>
                      <p className="text-sm text-zinc-deep">
                        {c.suburb} · ★ {card.ratingAvg.toFixed(1)} ({card.ratingCount}) · {prices} prices on · ABN {c.abn}
                      </p>
                    </div>
                    <Badge tone={status === 'APPROVED' ? 'good' : status === 'PENDING' ? 'caution' : 'bad'}>
                      {status === 'APPROVED' ? 'Approved' : status === 'PENDING' ? 'Pending' : 'Suspended'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-sm">
                    {status !== 'APPROVED' && (
                      <button type="button" className="font-medium text-good hover:underline" onClick={() => setStatus(c.id, 'APPROVED')}>
                        Approve
                      </button>
                    )}
                    {status !== 'SUSPENDED' && (
                      <button type="button" className="font-medium text-bad hover:underline" onClick={() => setStatus(c.id, 'SUSPENDED')}>
                        Suspend
                      </button>
                    )}
                    {status !== 'PENDING' && (
                      <button type="button" className="font-medium text-graphite-soft hover:text-graphite" onClick={() => setStatus(c.id, 'PENDING')}>
                        Move to pending
                      </button>
                    )}
                    <Link href={`/admin/pricing?business=${c.id}`} className="font-medium text-signal hover:text-signal-hover">
                      Price rules
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </AdminShell>
  )
}

export function AdminPricingPage() {
  const params = useSearchParams()
  const rules = useDemo((s) => s.rules)
  const [companyId, setCompanyId] = useState(params.get('business') ?? COMPANIES[0].id)
  const [percent, setPercent] = useState('5')
  const [flash, setFlash] = useState<string | null>(null)
  const list = rules[companyId] ?? []
  const company = companyById(companyId)!

  const setPrice = (ruleId: string, dollars: string) => {
    const cents = Math.round(Number(dollars.replace(/[$,\s]/g, '')) * 100)
    if (!Number.isFinite(cents) || cents <= 0) {
      setFlash('Enter a price greater than zero.')
      return
    }
    update((s) => {
      const rule = s.rules[companyId]?.find((r) => r.id === ruleId)
      if (rule) rule.priceCents = cents
    })
    setFlash(`Saved. ${company.name}'s next quotes use ${formatMoney(cents)} for that size range.`)
  }

  const adjustAll = (direction: 1 | -1) => {
    const pct = Number(percent)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 50) {
      setFlash('Use a percentage between 1 and 50.')
      return
    }
    const factor = 1 + (direction * pct) / 100
    update((s) => {
      for (const rule of s.rules[companyId] ?? []) rule.priceCents = Math.round((rule.priceCents * factor) / 500) * 500
    })
    setFlash(`${direction > 0 ? 'Raised' : 'Lowered'} every ${company.name} price by ${pct}%. Compare quotes again to see it.`)
  }

  return (
    <AdminShell permission="admin:settings">
      {() => (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Price rules</h2>
          <p className="text-sm text-graphite-soft">
            Indicative demo prices. Edit one here and the customer&rsquo;s next comparison in Design uses it. Quotes already issued keep their own copy.
          </p>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-rail p-4 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-graphite">
              Business
              <Select
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value)
                  setFlash(null)
                  navigate(`/admin/pricing?business=${e.target.value}`, { replace: true })
                }}
              >
                {COMPANIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-graphite">
                Adjust all by %
                <Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" className="w-24" />
              </label>
              <Button type="button" variant="secondary" onClick={() => adjustAll(1)}>
                Raise
              </Button>
              <Button type="button" variant="secondary" onClick={() => adjustAll(-1)}>
                Lower
              </Button>
            </div>
          </div>
          {flash && (
            <p role="status" className="text-sm text-good">
              {flash}{' '}
              <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
                Open Design
              </Link>
            </p>
          )}
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Sizes (mm)</Th>
                <Th>Terms</Th>
                <Th>Price</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((rule) => (
                <tr key={rule.id} className={rule.active ? undefined : 'opacity-60'}>
                  <Td>
                    <span className="font-medium">{productLabel(rule.product)}</span>
                    {rule.productStyle && <span className="block text-micro text-zinc-deep">{styleLabel(rule.productStyle)}</span>}
                  </Td>
                  <Td className="whitespace-nowrap font-code text-micro">{sizeRangeLabel(rule)}</Td>
                  <Td className="text-micro">
                    {rule.motorIncluded ? 'Motor included' : rule.motorAddOnCents ? `Motor +${formatMoney(rule.motorAddOnCents)}` : 'No motor'}
                    <span className="block text-zinc-deep">{INSTALLATION_LABELS[rule.installation]}</span>
                  </Td>
                  <Td>
                    <PriceCell
                      cents={rule.priceCents}
                      onSave={(value) => setPrice(rule.id, value)}
                      label={`Price for ${productLabel(rule.product)} ${sizeRangeLabel(rule)}`}
                    />
                    <span className="block text-micro text-zinc-deep">
                      {rule.gst === 'EXCLUSIVE'
                        ? `+ GST = ${formatMoney(gstBreakdown(rule.priceCents, 'EXCLUSIVE').totalIncGstCents)}`
                        : 'inc GST'}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/pricing/${rule.id}?business=${companyId}`} className="text-sm font-medium text-signal hover:text-signal-hover">
                      Full edit
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </AdminShell>
  )
}

function PriceCell({ cents, onSave, label }: { cents: number; onSave: (value: string) => void; label: string }) {
  const [value, setValue] = useState(String(cents / 100))
  const dirty = value !== String(cents / 100)
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(value)
      }}
    >
      <Input aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="h-9 w-28" />
      {dirty && (
        <Button type="submit" size="sm">
          Save
        </Button>
      )}
    </form>
  )
}

export function AdminReviewsPage() {
  const state = useDemo((s) => s)
  const toggle = (id: string) =>
    update((s) => {
      s.hiddenReviews = s.hiddenReviews.includes(id) ? s.hiddenReviews.filter((x) => x !== id) : [...s.hiddenReviews, id]
    })
  const all = [
    ...state.jobs
      .filter((j) => j.review)
      .map((j) => ({ id: `job-${j.id}`, companyId: j.companyId, author: j.customerName, rating: j.review!.rating, text: j.review!.body, fromJob: true })),
    ...state.reviews.map((r) => ({ id: r.id, companyId: r.companyId, author: r.author, rating: r.rating, text: r.text, fromJob: false })),
  ]
  return (
    <AdminShell permission="admin:settings">
      {() => (
        <section>
          <SectionTitle>Reviews ({all.length})</SectionTitle>
          <p className="mb-4 text-sm text-graphite-soft">Hide a review to take it off the business&rsquo;s profile and its rating. Every review here is sample data.</p>
          <ul className="flex flex-col gap-3">
            {all.map((r) => {
              const hidden = state.hiddenReviews.includes(r.id)
              return (
                <li key={r.id} className={`rounded-lg border border-line bg-paper p-4 ${hidden ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-sm font-medium text-graphite">
                      <span className="text-caution" aria-label={`${r.rating} out of 5`}>
                        {'★'.repeat(r.rating)}
                      </span>{' '}
                      {r.author} on {companyById(r.companyId)?.name}
                    </p>
                    <div className="flex items-center gap-2">
                      {r.fromJob && <Badge tone="signal">From a demo job</Badge>}
                      {hidden && <Badge>Hidden</Badge>}
                      <DemoTag>Demo review</DemoTag>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-graphite-soft">{r.text}</p>
                  <div className="mt-3 border-t border-line pt-3">
                    <button type="button" className="text-sm font-medium text-signal hover:text-signal-hover" onClick={() => toggle(r.id)}>
                      {hidden ? 'Show again' : 'Hide review'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </AdminShell>
  )
}

export function AdminUsersPage() {
  return (
    <AdminShell permission="admin:settings">
      {(session) => (
        <section>
          <SectionTitle>Demo accounts ({DEMO_ACCOUNTS.length})</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Business</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {DEMO_ACCOUNTS.map((a) => (
                <tr key={a.email}>
                  <Td className="font-medium">{a.name}</Td>
                  <Td className="font-code text-micro">{a.email}</Td>
                  <Td>
                    <Badge tone="signal">{a.role}</Badge>
                  </Td>
                  <Td>{a.companyId ? companyById(a.companyId)?.name : '—'}</Td>
                  <Td>
                    {a.email === session.email ? (
                      <span className="text-sm text-zinc-deep">You</span>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium text-signal hover:text-signal-hover"
                        onClick={() => {
                          signInAs(a)
                          navigate(a.role === 'installer' ? '/leads' : a.role === 'customer' ? '/' : '/dashboard')
                        }}
                      >
                        Sign in as
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-micro text-zinc-deep">All demo accounts use the password Demo123!. Fictional people.</p>
        </section>
      )}
    </AdminShell>
  )
}

export function AdminMetricsPage() {
  const state = useDemo((s) => s)
  const paid = state.jobs.flatMap((j) => j.payments.filter((p) => p.status === 'PAID'))
  const gross = paid.reduce((sum, p) => sum + p.grossCents, 0)
  const fee = paid.reduce((sum, p) => sum + calculateSplit(p.grossCents, DEFAULT_COMMISSION_BPS).commissionCents, 0)
  const rows = COMPANIES.map((c) => {
    const quotes = state.quotes.filter((q) => q.companyId === c.id)
    const jobs = state.jobs.filter((j) => j.companyId === c.id)
    return {
      company: c,
      quotes: quotes.length,
      bookings: jobs.length,
      completed: jobs.filter((j) => j.status === 'COMPLETED').length,
      revenue: jobs.flatMap((j) => j.payments.filter((p) => p.status === 'PAID')).reduce((sum, p) => sum + p.grossCents, 0),
      rating: businessCard(c.id, state).ratingAvg,
      reviews: reviewsFor(c.id, state).length,
    }
  })
  return (
    <AdminShell permission="admin:settings">
      {() => (
        <div className="flex flex-col gap-8">
          <section>
            <SectionTitle>This demo session</SectionTitle>
            <StatGrid
              stats={[
                { label: 'Comparisons run', count: state.comparisons.length, href: null },
                { label: 'Quotes issued', count: state.quotes.length, href: null },
                { label: 'Bookings', count: state.jobs.length, href: '/admin/marketplace' },
                { label: 'Completed jobs', count: state.jobs.filter((j) => j.status === 'COMPLETED').length, href: null },
                { label: 'Paid (simulated)', count: formatMoney(gross), href: null },
                { label: `Doorlink fee (${formatCommissionRate(DEFAULT_COMMISSION_BPS)})`, count: formatMoney(fee), href: null },
              ]}
            />
          </section>
          <section>
            <SectionTitle>By business</SectionTitle>
            <Table>
              <thead>
                <tr>
                  <Th>Business</Th>
                  <Th>Quotes</Th>
                  <Th>Bookings</Th>
                  <Th>Completed</Th>
                  <Th>Paid (simulated)</Th>
                  <Th>Rating</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.company.id}>
                    <Td className="font-medium">{r.company.name}</Td>
                    <Td>{r.quotes}</Td>
                    <Td>{r.bookings}</Td>
                    <Td>{r.completed}</Td>
                    <Td>{formatMoney(r.revenue)}</Td>
                    <Td>
                      ★ {r.rating.toFixed(1)} <span className="text-micro text-zinc-deep">({r.reviews} shown)</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        </div>
      )}
    </AdminShell>
  )
}

export function AdminSettingsPage() {
  return (
    <AdminShell permission="admin:settings">
      {() => (
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelBody>
              <h2 className="text-sm font-medium text-graphite">Marketplace fee</h2>
              <p className="mt-1 text-2xl font-semibold text-graphite">{formatCommissionRate(DEFAULT_COMMISSION_BPS)}</p>
              <p className="mt-1 text-sm text-graphite-soft">Taken from the business&rsquo;s side of each booking. Fixed in the demo.</p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelBody>
              <h2 className="text-sm font-medium text-graphite">Demo mode</h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-graphite-soft">
                <li>Payments: simulated, nothing is charged</li>
                <li>Email, SMS and push notifications: off</li>
                <li>Image generation and identification: local previews only</li>
                <li>Uploads: kept in this browser, never sent anywhere</li>
                <li>Data: stored in this browser only</li>
              </ul>
            </PanelBody>
          </Panel>
          <ResetDemoPanel />
        </div>
      )}
    </AdminShell>
  )
}
