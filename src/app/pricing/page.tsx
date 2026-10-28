import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { getOwnProfile, listOwnQuotes, listOwnRules } from '@/lib/quoting/company'
import { CATEGORIES, categoryInfo } from '@/lib/quoting/catalogue'
import { INSTALLATION_LABELS, priceLabel } from '@/lib/quoting/forms'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CreateBusinessForm, ProfileForm } from './BusinessForms'
import { deleteRuleAction, toggleRuleAction } from './actions'
import { pricingAccess } from './access'

// Per-user and per-business data: always rendered on request, never at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Automated pricing' }

type PageProps = { searchParams: Promise<{ saved?: string; problem?: string }> }

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full min-w-0 max-w-shell px-4 py-10 sm:py-14">{children}</div>
)

export default async function PricingPage({ searchParams }: PageProps) {
  const params = await searchParams
  let access
  try {
    access = await pricingAccess('/pricing')
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <Shell><NotConnected feature="Automated pricing" reason="Can't reach the database right now." /></Shell>
  }
  if (access.kind === 'blocked') return <Shell>{access.screen}</Shell>

  if (access.kind === 'no-business') {
    const tech = await prisma.technicianProfile.findUnique({ where: { userId: access.userId }, select: { businessName: true } })
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Automated pricing</h1>
        <p className="mt-2 max-w-prose text-graphite-soft">
          Prices belong to a business, so other people in your business can manage them too, and no other business can see them. Set yours up first.
        </p>
        <div className="mt-6"><CreateBusinessForm suggestedName={tech?.businessName ?? ''} /></div>
      </Shell>
    )
  }

  const { ctx } = access
  const [rules, profile, quotes] = await Promise.all([listOwnRules(ctx), getOwnProfile(ctx), listOwnQuotes(ctx, 20)])
  const activeCount = rules.filter((r) => r.isActive).length
  const live = Boolean(profile?.quotingEnabled) && activeCount > 0

  return (
    <Shell>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">{ctx.organizationName}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Automated pricing</h1>
          <p className="mt-1 max-w-prose text-graphite-soft">
            Your prices, your size ranges. Customers who design a product and choose your business get a quote worked out from these. Only people in your business can see them.
          </p>
        </div>
        <Badge tone={live ? 'good' : 'neutral'}>{live ? 'Quoting customers' : 'Not quoting yet'}</Badge>
      </header>

      {params.problem && <p role="alert" className="mb-6 rounded-md border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{params.problem}</p>}
      {params.saved === 'rule' && <p className="mb-6 rounded-md border border-good/30 bg-good/5 p-3 text-sm text-good">Price saved. New quotes use it straight away; quotes already sent keep their price.</p>}
      {params.saved === 'deleted' && <p className="mb-6 rounded-md border border-line bg-rail p-3 text-sm text-graphite">Price deleted.</p>}

      <section className="mb-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-graphite">Your prices</h2>
          <Link href="/pricing/rules/new" className="inline-flex h-11 items-center rounded bg-signal px-5 text-sm font-medium text-paper hover:bg-signal-hover">Add a price</Link>
        </div>
        {rules.length === 0 ? (
          <EmptyState title="No prices yet" description="Add a price for a product and size range, for example garage doors 2,300–2,500 mm wide and high, motor and installation included." />
        ) : (
          CATEGORIES.filter((c) => rules.some((r) => r.category === c.id)).map((c) => (
            <div key={c.id} className="mb-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">{c.plural}</h3>
              <ul className="flex flex-col gap-2">
                {rules.filter((r) => r.category === c.id).map((r) => (
                  <li key={r.id} className="rounded-md border border-line bg-paper p-4" data-rule={r.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-graphite">
                          {r.brand ?? 'No brand'} · {priceLabel(r.priceCents, r.gst)}
                        </p>
                        <p className="mt-1 text-sm text-zinc-deep">
                          {categoryInfo(r.category).widthLabel} {r.widthMinMm.toLocaleString('en-AU')}–{r.widthMaxMm.toLocaleString('en-AU')} mm · {categoryInfo(r.category).heightLabel.toLowerCase()} {r.heightMinMm.toLocaleString('en-AU')}–{r.heightMaxMm.toLocaleString('en-AU')} mm
                        </p>
                        <p className="mt-1 text-sm text-zinc-deep">
                          {r.motorIncluded ? `Motor included${r.motorBrand ? ` (${r.motorBrand})` : ''}` : c.motorPolicy === 'none' ? 'No motor' : 'No motor'} · {INSTALLATION_LABELS[r.installation]}
                          {r.installation === 'EXTRA' && r.installPriceCents ? ` (${formatMoney(r.installPriceCents)})` : ''}
                        </p>
                      </div>
                      <Badge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Off'}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/pricing/rules/${r.id}/edit`} className="inline-flex h-9 items-center rounded border border-line px-3 text-sm font-medium text-graphite hover:bg-rail">Edit</Link>
                      <form action={toggleRuleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="active" value={String(!r.isActive)} />
                        <Button type="submit" variant="secondary" size="sm">{r.isActive ? 'Turn off' : 'Turn on'}</Button>
                      </form>
                      <form action={deleteRuleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" variant="secondary" size="sm">Delete</Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="mb-12 max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold text-graphite">Company profile</h2>
        <ProfileForm
          hasActiveRules={activeCount > 0}
          initial={{
            about: profile?.about ?? '', serviceArea: profile?.serviceArea ?? '', phone: profile?.phone ?? '',
            website: profile?.website ?? '', abn: profile?.abn ?? '', quotingEnabled: profile?.quotingEnabled ?? false,
          }}
        />
        <p className="mt-3 text-sm text-zinc-deep">
          Customers see your star rating only from reviews left on completed Doorlink jobs by your business&apos;s technicians.{' '}
          {live && <Link href={`/companies/${ctx.organizationId}`} className="font-medium text-signal hover:text-signal-hover">See your public profile</Link>}
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-graphite">Quotes you have given</h2>
        {quotes.length === 0 ? (
          <EmptyState title="No quotes yet" description="Automated quotes customers receive from your business appear here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/quotes/${q.requestId}`} className="block rounded-md border border-line bg-paper p-4 hover:border-signal">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-graphite">
                      {categoryInfo(q.request.category).label}, {q.request.widthMm} × {q.request.heightMm} mm{q.brand ? `, ${q.brand}` : ''}
                    </span>
                    <span className="text-sm text-graphite">{q.status === 'QUOTED' && q.totalCents !== null ? `${formatMoney(q.totalCents)} inc GST` : 'Not covered by your prices'}</span>
                  </div>
                  <p className="mt-1 text-micro text-zinc-deep">
                    {q.request.reference} · {q.createdAt.toLocaleDateString('en-AU')} · {q.customer ? `${q.customer.name} (${q.customer.email})` : 'Customer did not share contact details'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}
