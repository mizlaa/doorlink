import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { describeSpec, familyOf, parseSpec, specAsBrief } from '@/lib/configurator/options'
import { formatMoney } from '@/lib/money'
import { DOCUMENT_COUNT, TOTAL_PAGES, COMPLIANCE_DISCLAIMER, documentsBySection, findDocument } from '@/lib/compliance/catalogue'
import { contentFor } from '@/lib/compliance/content'
import { COMPLIANCE_CURRENCY, DEFAULT_COMPLIANCE_PRICE_CENTS } from '@/lib/compliance/pricing'
import { RequestForm } from '@/app/request-technician/RequestForm'
import { SpringCalculator } from '@/app/tools/spring-calculator/SpringCalculator'
import { DocumentView } from '@/app/compliance/pack/DocumentView'
import '@/app/compliance/pack/compliance-print.css'
import FindPage from '@/app/find/page'
import FindUnknownPage from '@/app/find/unknown/page'
import ToolsPage from '@/app/tools/page'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { PrintButton } from '@/components/ui/PrintButton'
import { isFramed, navigate } from '../router'
import { companyUserId, getDemo, makeId, makeReference, notify, update, useDemo, type Lead } from '../demo/store'
import { BRANDS, COMPANIES, companyById, PRODUCT_CATEGORIES, SEED_MANUALS } from '../demo/data'
import { FINDER_MODELS, manualsForModel } from '../demo/catalogue'
import { DemoTag, SignInPrompt } from './shared'
import { NotFoundPage } from './NotFound'

export { FindPage, ToolsPage }

/* ------------------------------------------------------------------ */
/* Hire a pro (src/app/request-technician/page.tsx)                    */
/* ------------------------------------------------------------------ */

export function RequestTechnicianPage() {
  const params = useSearchParams()
  const session = useDemo((s) => s.session)
  const raw = params.get('spec')
  const prefill = useMemo(() => {
    if (!raw) return undefined
    try {
      const parsed = parseSpec(JSON.parse(raw))
      const type = describeSpec(parsed)[0]?.value ?? 'garage door'
      const garage = familyOf(parsed.productType) === 'garage'
      const product = garage ? `${type.toLowerCase()} garage door` : type.toLowerCase()
      return {
        title: `New ${product}: supply and install`,
        message: `I've designed a ${garage ? 'door' : product} in the Doorlink configurator and would like a price to supply and install it.\n\n${specAsBrief(parsed)}\n\nThese are Doorlink's generic options rather than a specific product, so let me know the nearest equivalent you can supply.`,
      }
    } catch {
      return undefined
    }
  }, [raw])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">Post a job</h1>
        <p className="mt-2 text-graphite-soft">Local technicians quote. You pick who to hire.</p>
      </header>
      <RequestForm
        prefill={prefill}
        signedIn={Boolean(session)}
        serviceCategories={PRODUCT_CATEGORIES.map((name) => ({ id: name, label: name }))}
        models={FINDER_MODELS.map((m) => ({ id: m.id, label: `${m.modelCode} | ${m.brand} ${m.name}` }))}
      />
    </div>
  )
}

export function RequestThanksPage() {
  const ref = useSearchParams().get('ref')
  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-graphite">Your job is posted</h1>
      {ref && (
        <div className="mt-5 rounded-md border border-line bg-rail p-4">
          <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">Your reference</p>
          <p className="mt-1 font-code text-lg text-graphite">{ref}</p>
          <p className="mt-2 text-sm text-graphite-soft">Keep this. It identifies your job if you need to get in touch.</p>
        </div>
      )}
      <div className="mt-6 space-y-3 text-graphite-soft">
        <p>Technicians covering your area can now see the job and send you a quote.</p>
        <p className="rounded-md border border-caution/30 bg-caution-tint p-3 text-sm text-graphite">
          Demo: nothing is emailed or texted. Sign in as the installer account to see this job on the job board and quote on it.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/my-requests"
          className="inline-flex h-11 items-center rounded bg-signal px-5 text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
        >
          Track your job
        </Link>
        <Link href="/" className="inline-flex h-11 items-center rounded border border-line px-5 text-sm font-medium text-graphite transition-colors hover:bg-rail">
          Back to home
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* My requests: jobs posted with "Hire a pro", and the quotes on them  */
/* ------------------------------------------------------------------ */

function leadsFor(leads: Lead[], userId: string | undefined) {
  return leads.filter((l) => l.customerId && l.customerId === userId)
}

export function MyRequestsPage() {
  const session = useDemo((s) => s.session)
  const leads = useDemo((s) => s.leads)
  if (!session) return <SignInPrompt next="/my-requests" />
  const mine = leadsFor(leads, session.userId)
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">My requests</h1>
        <Link href="/request-technician" className="text-sm font-medium text-signal hover:text-signal-hover">
          Post a job
        </Link>
      </div>
      {mine.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No jobs posted yet"
            description="Post a job and local technicians send you quotes. You choose who to hire."
            action={
              <Link href="/request-technician" className="font-medium text-signal hover:text-signal-hover">
                Post a job
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {mine.map((lead) => (
            <li key={lead.reference}>
              <Link href={`/my-requests/${lead.reference}`} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4 hover:border-signal">
                <span className="min-w-0">
                  <span className="block font-medium text-graphite">{lead.title}</span>
                  <span className="block text-sm text-zinc-deep">
                    <span className="font-code">{lead.reference}</span> · {lead.suburb} {lead.postcode}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={lead.responses.length ? 'good' : 'neutral'}>
                    {lead.responses.length ? `${lead.responses.length} quote${lead.responses.length > 1 ? 's' : ''}` : 'Waiting for quotes'}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MyRequestPage({ params }: { params: Record<string, string> }) {
  const session = useDemo((s) => s.session)
  const leads = useDemo((s) => s.leads)
  if (!session) return <SignInPrompt next={`/my-requests/${params.reference}`} />
  const lead = leads.find((l) => l.reference === params.reference && l.customerId === session.userId)
  if (!lead) return <NotFoundPage />

  const simulateQuote = () => {
    const company = COMPANIES[(lead.responses.length + 1) % COMPANIES.length]
    const price = Math.round(((lead.budgetToAUD ?? 900) * (0.86 + lead.responses.length * 0.07)) / 10) * 10
    update((s) => {
      const l = s.leads.find((x) => x.reference === lead.reference)!
      l.responses.push({
        companyId: company.id,
        priceAUD: price,
        message: 'We can do this within the fortnight. Price includes parts, labour and removal of the old unit.',
        at: new Date().toISOString(),
      })
      l.status = 'Quoted'
    })
  }

  const accept = (companyId: string, priceAUD: number) => {
    const company = companyById(companyId)!
    const jobId = makeId('job')
    update((s) => {
      const l = s.leads.find((x) => x.reference === lead.reference)!
      l.status = 'Scheduled'
      l.acceptedCompanyId = companyId
      s.jobs.unshift({
        id: jobId,
        reference: makeReference('JOB', 6),
        customerId: session.userId,
        customerName: session.name,
        customerEmail: session.email,
        companyId,
        description: `${lead.title}\n\n${lead.description}`,
        status: 'ACCEPTED',
        priceType: 'FIXED',
        agreedPriceCents: priceAUD * 100,
        depositPercent: 100,
        quoteRef: null,
        scheduledAt: null,
        businessNote: null,
        declinedReason: null,
        termsAcceptedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        events: [{ from: null, to: 'ACCEPTED', actorName: session.name, note: `Accepted ${company.name}'s quote of ${formatMoney(priceAUD * 100)}. Paying the business directly.`, at: new Date().toISOString() }],
        payments: [],
        updates: [],
        review: null,
        site: `${lead.suburb} ${lead.state} ${lead.postcode}`,
        timing: lead.urgency === 'URGENT' ? 'As soon as possible' : 'Within 2 weeks',
      })
    })
    const businessUser = companyUserId(companyId)
    if (businessUser) {
      notify(businessUser, 'Your quote was accepted', `${session.name} accepted your quote for “${lead.title}”.`, `/jobs/${jobId}`)
    }
    navigate(`/jobs/${jobId}`)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/my-requests" className="text-sm font-medium text-signal hover:text-signal-hover">
        My requests
      </Link>
      <p className="mt-4 font-code text-sm text-zinc-deep">{lead.reference}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">{lead.title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-graphite-soft">{lead.description}</p>
      <p className="mt-2 text-sm text-zinc-deep">
        {lead.suburb} {lead.state} {lead.postcode}
        {lead.budgetToAUD ? ` · budget up to ${formatMoney(lead.budgetToAUD * 100)}` : ''}
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Quotes from technicians</h2>
        {lead.responses.length === 0 ? (
          <EmptyState title="No quotes yet" description="Technicians covering your area can see the job. Quotes appear here." />
        ) : (
          <ul className="flex flex-col gap-3">
            {lead.responses.map((r, i) => {
              const company = companyById(r.companyId)!
              return (
                <li key={i} className="rounded-lg border border-line bg-paper p-5 shadow-panel">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/businesses/${company.id}`} className="font-semibold text-graphite hover:text-signal">
                        {company.name}
                      </Link>
                      <p className="text-sm text-zinc-deep">
                        ★ {company.rating.toFixed(1)} · {company.reviewCount} reviews · {company.suburb}
                      </p>
                    </div>
                    <p className="text-2xl font-semibold text-graphite">{formatMoney(r.priceAUD * 100)}</p>
                  </div>
                  <p className="mt-3 text-sm text-graphite-soft">“{r.message}”</p>
                  {lead.status !== 'Scheduled' && (
                    <div className="mt-4 border-t border-line pt-4">
                      <Button type="button" onClick={() => accept(r.companyId, r.priceAUD)}>
                        Accept this quote
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {lead.status !== 'Scheduled' && (
          <Panel className="mt-6 border-dashed border-caution/40 bg-caution-tint">
            <PanelBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-graphite">
                <DemoTag>Demo</DemoTag> See what a technician’s quote looks like.
              </p>
              <Button type="button" variant="secondary" onClick={simulateQuote}>
                Simulate a quote from a local business
              </Button>
            </PanelBody>
          </Panel>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Marketplace (src/app/marketplace/page.tsx)                          */
/* ------------------------------------------------------------------ */

const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'USED', label: 'Used' },
]

const CONDITION_LABEL: Record<string, string> = {
  NEW: 'new',
  REFURBISHED: 'refurbished',
  USED_LIKE_NEW: 'used, like new',
  USED_GOOD: 'used, good',
}

export function MarketplacePage() {
  const params = useSearchParams()
  const session = useDemo((s) => s.session)
  const all = useDemo((s) => s.listings)
  const saved = useDemo((s) => s.savedListings)
  const q = params.get('q')?.trim() ?? ''
  const category = params.get('category') ?? ''
  const brand = params.get('brand') ?? ''
  const condition = params.get('condition') ?? ''
  const hasActiveFilters = Boolean(q || category || brand || condition)
  const listings = all.filter(
    (l) =>
      l.status === 'ACTIVE' &&
      (!category || l.category === category) &&
      (!brand || l.brand === brand) &&
      (!condition || (condition === 'USED' ? l.condition.startsWith('USED') : l.condition === condition)) &&
      (!q || `${l.title} ${l.model} ${l.brand}`.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <h1 className="text-2xl font-semibold text-graphite">Marketplace</h1>
      <p className="mt-2 max-w-prose text-graphite-soft">Parts from other members. Buy direct from the seller.</p>

      <form
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const query = new URLSearchParams()
          for (const key of ['q', 'category', 'brand', 'condition']) {
            const v = String(data.get(key) ?? '').trim()
            if (v) query.set(key, v)
          }
          navigate(`/marketplace${query.toString() ? `?${query}` : ''}`, { replace: true })
        }}
      >
        <Input name="q" defaultValue={q} placeholder="Search title or model…" aria-label="Search listings" className="lg:col-span-2" />
        <Select name="category" defaultValue={category} aria-label="Category">
          <option value="">All categories</option>
          {PRODUCT_CATEGORIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Select name="brand" defaultValue={brand} aria-label="Manufacturer">
          <option value="">All manufacturers</option>
          {BRANDS.map((name) => (
            <option key={name} value={name}>
              {name}
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
          <EmptyState title="No listings match your filters" description="Try a broader search or clear some filters." />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-zinc-deep">
            {listings.length} listing{listings.length === 1 ? '' : 's'}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => {
              const seller = companyById(listing.sellerCompanyId)
              const isSaved = saved.includes(listing.id)
              return (
                <Panel key={listing.id}>
                  <PanelBody>
                    <p className="font-code text-sm text-zinc-deep">{listing.model}</p>
                    <Link href={`/marketplace/${listing.id}`} className="mt-1 block font-medium text-graphite hover:text-signal">
                      {listing.title}
                    </Link>
                    <p className="mt-1 text-sm text-zinc-deep">Sold by {seller?.name ?? listing.sellerName ?? 'a Doorlink member'}</p>
                    <p className="mt-2 text-lg font-semibold text-graphite">{formatMoney(listing.priceCents)}</p>
                    <p className="mt-1 text-micro uppercase tracking-wide text-zinc-deep">
                      {CONDITION_LABEL[listing.condition] ?? listing.condition.toLowerCase()} · {listing.stock} in stock
                    </p>
                    <div className="mt-2">
                      <SourceBadge source="DEMO" />
                    </div>
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {session ? (
                        <>
                          <Link href={`/marketplace/${listing.id}`} className="inline-flex h-9 items-center rounded bg-signal px-3 text-sm font-medium text-paper hover:bg-signal-hover">
                            Contact seller
                          </Link>
                          <button
                            type="button"
                            className="text-sm font-medium text-signal hover:text-signal-hover"
                            onClick={() =>
                              update((s) => {
                                s.savedListings = isSaved ? s.savedListings.filter((id) => id !== listing.id) : [...s.savedListings, listing.id]
                              })
                            }
                          >
                            {isSaved ? 'Saved ✓' : 'Save for later'}
                          </button>
                        </>
                      ) : (
                        <Link href="/sign-in?next=/marketplace" className="text-sm font-medium text-signal hover:text-signal-hover">
                          Sign in to buy
                        </Link>
                      )}
                    </div>
                  </PanelBody>
                </Panel>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function ListingPage({ params }: { params: Record<string, string> }) {
  const session = useDemo((s) => s.session)
  const listings = useDemo((s) => s.listings)
  const [sent, setSent] = useState(false)
  const listing = listings.find((l) => l.id === params.id)
  if (!listing) return <NotFoundPage />
  const company = companyById(listing.sellerCompanyId)
  const seller = company ?? {
    name: listing.sellerName ?? 'A Doorlink member',
    rating: 5,
    reviewCount: 0,
    responseTime: 'Within a day',
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/marketplace" className="text-sm font-medium text-signal hover:text-signal-hover">
        ← Marketplace
      </Link>
      <p className="mt-4 font-code text-sm text-zinc-deep">{listing.model}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">{listing.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{listing.category}</Badge>
        <Badge tone="neutral">{CONDITION_LABEL[listing.condition]}</Badge>
        <SourceBadge source="DEMO" />
      </div>
      <p className="mt-4 text-3xl font-semibold text-graphite">{formatMoney(listing.priceCents)}</p>
      <p className="mt-1 text-sm text-zinc-deep">{listing.stock} in stock · {listing.suburb}</p>
      <p className="mt-4 text-graphite-soft">{listing.description}</p>

      <Panel className="mt-8">
        <PanelBody className="flex flex-col gap-3">
          <p className="font-medium text-graphite">Sold by {seller.name}</p>
          <p className="text-sm text-zinc-deep">
            ★ {seller.rating.toFixed(1)} · {seller.reviewCount} reviews · replies {seller.responseTime.toLowerCase()}
          </p>
          {!session ? (
            <Link href={`/sign-in?next=/marketplace/${listing.id}`} className="text-sm font-medium text-signal hover:text-signal-hover">
              Sign in to contact the seller
            </Link>
          ) : sent ? (
            <p className="rounded-md border border-good/40 bg-natural/10 px-3 py-2 text-sm text-graphite">
              Message added to your inbox. Demo: nothing is sent to the seller, and nothing is bought.
            </p>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                const text = String(new FormData(event.currentTarget).get('message') ?? '').trim() || 'Is this still available?'
                update((s) => {
                  s.conversations.unshift({
                    id: makeId('c'),
                    ownerUserId: session.userId,
                    withName: seller.name,
                    subject: listing.title,
                    unread: 0,
                    messages: [{ from: 'me', text, at: new Date().toISOString() }],
                  })
                })
                setSent(true)
              }}
            >
              <Field label="Message the seller" htmlFor="message">
                <Textarea id="message" name="message" defaultValue="Hi, is this still available? I can pick up this week." />
              </Field>
              <div>
                <Button type="submit">Send message</Button>
              </div>
            </form>
          )}
        </PanelBody>
      </Panel>
      <p className="mt-4 text-micro text-zinc-deep">Demo listing. Buyers and sellers arrange payment and delivery between themselves; the demo takes no payment.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Manuals (src/app/manuals/page.tsx)                                  */
/* ------------------------------------------------------------------ */

function FacetList({ items }: { items: Array<{ label: string; count: number; href: string; active: boolean }> }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            replace
            className={
              item.active
                ? 'flex items-center justify-between rounded bg-signal-tint px-2 py-1.5 text-sm font-medium text-signal'
                : 'flex items-center justify-between rounded px-2 py-1.5 text-sm text-graphite hover:bg-rail'
            }
          >
            <span className="truncate">{item.label}</span>
            <span className="ml-2 shrink-0 text-micro text-zinc-deep">{item.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ManualsPage() {
  const params = useSearchParams()
  const submissions = useDemo((s) => s.manualSubmissions)
  const q = params.get('q') ?? ''
  const brand = params.get('manufacturer') ?? ''
  const kind = params.get('kind') ?? ''
  const hasFilters = Boolean(q || brand || kind)
  const href = (next: Record<string, string | undefined>) => {
    const query = new URLSearchParams()
    const merged = { q, manufacturer: brand, kind, ...next }
    for (const [k, v] of Object.entries(merged)) if (v) query.set(k, v)
    return `/manuals${query.toString() ? `?${query}` : ''}`
  }
  const docs = SEED_MANUALS.filter(
    (m) => (!brand || m.brand === brand) && (!kind || m.kind === kind) && (!q || `${m.title} ${m.model} ${m.brand} ${m.type}`.toLowerCase().includes(q.toLowerCase()))
  )
  const countBy = (key: 'brand' | 'kind') => {
    const map = new Map<string, number>()
    for (const m of SEED_MANUALS) map.set(m[key], (map.get(m[key]) ?? 0) + 1)
    return [...map.entries()]
  }

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="max-w-prose">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">User manuals</h1>
            <p className="mt-2 text-graphite-soft">Installation, programming, wiring and troubleshooting manuals.</p>
          </div>
          <Link
            href="/manuals/submit"
            className="inline-flex h-11 shrink-0 items-center rounded border border-line bg-paper px-4 text-sm font-medium text-graphite transition-colors hover:border-signal hover:text-signal"
          >
            Submit a manual
          </Link>
        </div>
      </header>

      <form
        className="mt-6 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          navigate(href({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim() || undefined }), { replace: true })
        }}
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by model, document code, or a term inside the manual..."
          aria-label="Search manuals"
          className="h-11 min-w-0 flex-1 rounded border border-line bg-paper px-3 text-sm text-graphite placeholder:text-zinc focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
        />
        <button type="submit" className="h-11 shrink-0 rounded bg-signal px-5 text-sm font-medium text-paper transition-colors hover:bg-signal-hover">
          Search
        </button>
      </form>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="mb-6">
            <h2 className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">Manufacturer</h2>
            <FacetList
              items={countBy('brand').map(([label, count]) => ({ label, count, href: href({ manufacturer: brand === label ? undefined : label }), active: brand === label }))}
            />
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">Document type</h2>
            <FacetList items={countBy('kind').map(([label, count]) => ({ label, count, href: href({ kind: kind === label ? undefined : label }), active: kind === label }))} />
          </div>
          {hasFilters && (
            <Link href="/manuals" className="mt-4 inline-block text-sm font-medium text-signal hover:text-signal-hover">
              Clear all filters
            </Link>
          )}
        </aside>

        <section className="min-w-0 flex-1">
          <p className="mb-4 text-sm text-zinc-deep">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'}
            {hasFilters ? ' matching your search' : ' in the library'}
          </p>
          {docs.length === 0 ? (
            <EmptyState title="No manuals matched" description="Try a broader term, a model code, or clear the filters." />
          ) : (
            <ul className="flex flex-col gap-3">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/manuals/${doc.slug}`} className="block rounded-md border border-line bg-paper p-5 transition-colors hover:border-signal">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-graphite">{doc.title}</p>
                        <p className="mt-1 text-sm text-zinc-deep">
                          {doc.brand} · <span className="font-code">{doc.model}</span> · {doc.type} · {doc.pages} pages
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="neutral">{doc.kind}</Badge>
                        <Badge tone="caution">Demo sample</Badge>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {submissions.length > 0 && (
            <p className="mt-6 text-sm text-zinc-deep">
              {submissions.length} manual{submissions.length > 1 ? 's' : ''} you submitted {submissions.length > 1 ? 'are' : 'is'} waiting for review.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

const MANUAL_SECTIONS = [
  ['Before you start', 'Isolate power at the switchboard. Check the door is balanced and moves freely by hand. Read the safety notices in full before any work.'],
  ['What is in the box', 'Operator head, rail sections, remote handsets, wall bracket kit, safety beams where supplied, and fixings.'],
  ['Installation steps', '1. Mark the centre line of the door. 2. Fit the header bracket. 3. Assemble and lift the rail. 4. Hang the operator. 5. Connect the door arm. 6. Set travel limits.'],
  ['Programming remotes', 'Press the learn button on the operator until the light comes on. Press the remote button twice. The light flashes to confirm.'],
  ['Troubleshooting', 'Door reverses on close: check the safety beams are aligned. Remote has no range: replace the battery and re-learn the code.'],
]

export function ManualPage({ params }: { params: Record<string, string> }) {
  const manual = SEED_MANUALS.find((m) => m.slug === params.slug)
  if (!manual) return <NotFoundPage />
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/manuals" className="text-sm font-medium text-signal hover:text-signal-hover">
        ← Manuals
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-graphite">{manual.title}</h1>
      <p className="mt-1 text-sm text-zinc-deep">
        {manual.brand} · <span className="font-code">{manual.model}</span> · {manual.type} · {manual.pages} pages · {manual.year}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="neutral">{manual.kind}</Badge>
        <Badge tone="caution">Demo sample</Badge>
      </div>
      <div className="relative mt-8 overflow-hidden rounded-lg border border-line bg-paper p-6 shadow-panel">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="-rotate-12 text-4xl font-bold uppercase tracking-widest text-caution/10">Sample</span>
        </div>
        <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">Locally written sample guidance</p>
        {MANUAL_SECTIONS.map(([title, body]) => (
          <section key={title} className="mt-5">
            <h2 className="font-semibold text-graphite">{title}</h2>
            <p className="mt-1 text-sm text-graphite-soft">{body}</p>
          </section>
        ))}
        <p className="mt-6 text-micro text-zinc-deep">
          This is sample content for the demo, not the manufacturer’s manual and not installation advice. Real manuals in Doorlink are labelled
          by source.
        </p>
      </div>
    </div>
  )
}

export function ManualSubmitPage() {
  const session = useDemo((s) => s.session)
  const [done, setDone] = useState<string | null>(null)
  if (!session) return <SignInPrompt next="/manuals/submit" title="Sign in to submit a manual" />
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-graphite">Submit a manual</h1>
      <p className="mt-2 text-graphite-soft">Share a manual for a door, gate or motor. A Doorlink admin reviews it before it is published.</p>
      {done ? (
        <p className="mt-6 rounded-md border border-good/40 bg-natural/10 px-4 py-3 text-sm text-graphite">
          Received <span className="font-medium">{done}</span>. It is waiting for review. Demo: the file stays on your device and is not uploaded.
        </p>
      ) : (
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const file = data.get('file')
            const fileName = file instanceof File && file.name ? file.name : 'manual.pdf'
            update((s) => {
              s.manualSubmissions.unshift({ id: makeId('sub'), brand: String(data.get('brand') ?? ''), model: String(data.get('model') ?? ''), fileName, at: new Date().toISOString() })
            })
            setDone(fileName)
          }}
        >
          <Field label="Manufacturer" htmlFor="brand">
            <Input id="brand" name="brand" required defaultValue="Westline" />
          </Field>
          <Field label="Model" htmlFor="model">
            <Input id="model" name="model" required placeholder="e.g. S240 Sectional" />
          </Field>
          <Field label="PDF" htmlFor="file">
            <Input id="file" name="file" type="file" accept="application/pdf" />
          </Field>
          <div>
            <Button type="submit">Submit for review</Button>
          </div>
        </form>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Spring calculator, finder, identify                                  */
/* ------------------------------------------------------------------ */

export function SpringCalculatorPage() {
  const session = useDemo((s) => s.session)
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <Link href="/tools" className="text-sm text-graphite-soft underline">
          Tools
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-graphite">Spring calculator</h1>
        <p className="mt-2 max-w-prose text-sm text-graphite-soft">
          Estimate what a garage door needs from its springs. Answer a few questions rather than filling in a form — you only see the
          measurements your chosen method actually needs.
        </p>
        <p className="mt-2 text-xs text-caution">Demo: results are illustrative only, not engineering guidance. Spring work needs a trained technician.</p>
      </header>
      <SpringCalculator assets={[]} canSave={!!session} />
    </div>
  )
}

export function FindUnknownDemoPage() {
  const [preview, setPreview] = useState<string | null>(null)
  return (
    <>
      <FindUnknownPage />
      <div className="mx-auto max-w-prose px-4 pb-12">
        <Panel>
          <PanelBody className="flex flex-col gap-3">
            <p className="font-medium text-graphite">Add a photo of your door or motor</p>
            <p className="text-sm text-graphite-soft">The photo stays on this device. A technician uses it to identify the unit once you post a job.</p>
            <Input
              type="file"
              accept="image/*"
              aria-label="Photo of the door or motor"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => setPreview(String(reader.result))
                reader.readAsDataURL(file)
              }}
            />
            {preview && (
              <div className="flex flex-col gap-2">
                <img src={preview} alt="Your photo" className="max-h-72 w-full rounded-md border border-line object-cover" />
                <p className="text-sm text-graphite">Likely match: sectional door with a belt-drive opener.</p>
                <p className="text-micro text-caution">Demo identification, not AI verified.</p>
                <Link href="/request-technician" className="text-sm font-medium text-signal hover:text-signal-hover">
                  Post a job with this photo →
                </Link>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  )
}

export function ModelPage({ params }: { params: Record<string, string> }) {
  const model = FINDER_MODELS.find((m) => m.id === params.id)
  const listings = useDemo((s) => s.listings)
  if (!model) return <NotFoundPage />
  const manuals = manualsForModel(model)
  const forSale = listings.filter((l) => l.model.startsWith(model.modelCode))
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/find" className="text-sm font-medium text-signal hover:text-signal-hover">
        ← Find your product
      </Link>
      <p className="mt-4 font-code text-sm text-zinc-deep">{model.modelCode}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">
        {model.brand} {model.name}
      </h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="neutral">{model.category}</Badge>
        <Badge tone="neutral">{model.productLine}</Badge>
        <SourceBadge source="DEMO" />
      </div>
      <p className="mt-4 text-graphite-soft">{model.summary}</p>
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Manuals</h2>
        {manuals.length === 0 ? (
          <p className="text-sm text-graphite-soft">No manual in the demo library for this model yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {manuals.map((m) => (
              <li key={m.id}>
                <Link href={`/manuals/${m.slug}`} className="block rounded-md border border-line bg-paper p-4 hover:border-signal">
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">For sale</h2>
        {forSale.length === 0 ? (
          <p className="text-sm text-graphite-soft">No listings for this model right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {forSale.map((l) => (
              <li key={l.id}>
                <Link href={`/marketplace/${l.id}`} className="flex justify-between gap-3 rounded-md border border-line bg-paper p-4 hover:border-signal">
                  <span>{l.title}</span>
                  <span className="font-semibold">{formatMoney(l.priceCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/request-technician" className="inline-flex h-11 items-center rounded bg-signal px-5 text-sm font-medium text-paper hover:bg-signal-hover">
          Find a technician
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Compliance & Safety Pack (src/app/compliance/page.tsx)              */
/* ------------------------------------------------------------------ */

export function CompliancePage() {
  const sections = documentsBySection()
  return (
    <div className="mx-auto flex max-w-shell flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-4">
        <Badge tone="signal">Add-on</Badge>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-graphite sm:text-4xl">Compliance &amp; Safety Pack</h1>
        <p className="max-w-prose text-graphite-soft">{DOCUMENT_COUNT} safety documents for door and gate work, branded with your business.</p>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="text-3xl font-semibold text-graphite">{formatMoney(DEFAULT_COMPLIANCE_PRICE_CENTS, COMPLIANCE_CURRENCY)}</span>
          <span className="text-sm text-zinc-deep">One-off payment · {TOTAL_PAGES} pages · A4</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled>
            Buy the pack
          </Button>
          <span className="text-sm text-caution">Purchasing disabled in demo</span>
        </div>
        <div className="flex flex-col gap-1">
          <Link href="/compliance/pack" className="text-sm font-medium text-signal hover:text-signal-hover">
            Preview the documents
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      </header>

      <Panel className="border-caution/30 bg-caution-tint">
        <PanelBody>
          <p className="text-sm text-graphite">
            <span className="font-semibold text-caution">Templates, not legal advice.</span> NSW legislation is included; other states add
            their own. In the demo every page is marked as a sample.
          </p>
        </PanelBody>
      </Panel>

      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold text-graphite">What is in the pack</h2>
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {sections.map(({ section, documents }) => (
            <div key={section.number}>
              <h3 className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">{section.title}</h3>
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-rail">
                {documents.map((doc) => (
                  <li key={doc.code}>
                    <Link href={`/compliance/pack/${doc.code.toLowerCase()}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 hover:bg-paper">
                      <span className="font-medium text-graphite">{doc.title}</span>
                      {doc.jurisdictionSpecific && <Badge tone="caution">State-specific</Badge>}
                      {doc.needsProfessionalReview && <Badge tone="caution">Needs review</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line pt-6">
        <p className="max-w-prose text-micro text-zinc-deep">{COMPLIANCE_DISCLAIMER}</p>
      </footer>
    </div>
  )
}

export function CompliancePackPage() {
  const sections = documentsBySection()
  return (
    <div className="mx-auto flex max-w-shell flex-col gap-8 px-4 py-10">
      <header>
        <Link href="/compliance" className="text-sm font-medium text-signal hover:text-signal-hover">
          ← Compliance & Safety Pack
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-graphite">Sample documents</h1>
        <p className="mt-1 max-w-prose text-graphite-soft">
          Open any document to read it in full. Every page carries a sample watermark in the demo.
        </p>
      </header>
      {sections.map(({ section, documents }) => (
        <section key={section.number}>
          <h2 className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
            {section.number} · {section.title}
          </h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
            {documents.map((doc) => (
              <li key={doc.code}>
                <Link href={`/compliance/pack/${doc.code.toLowerCase()}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-rail">
                  <span className="min-w-0">
                    <span className="block font-medium text-graphite">{doc.title}</span>
                    <span className="block font-code text-micro text-zinc-deep">
                      {doc.code} · {doc.pages} pages
                    </span>
                  </span>
                  <span className="text-signal" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function ComplianceDocumentPage({ params }: { params: Record<string, string> }) {
  const profile = useDemo((s) => s.complianceProfile)
  const meta = findDocument(params.code.toUpperCase())
  const content = meta && contentFor(meta.code)
  if (!meta || !content) return <NotFoundPage />
  return (
    <div className="py-6">
      <div className="cp-hide-print mx-auto mb-5 flex max-w-shell flex-wrap items-center justify-between gap-3 px-4">
        <Link href="/compliance/pack" className="text-sm font-medium text-signal hover:text-signal-hover">
          <span aria-hidden="true">← </span>All documents
        </Link>
        <div className="flex items-center gap-3">
          <DemoTag>Sample — not for compliance use</DemoTag>
          {!isFramed && <PrintButton />}
        </div>
      </div>
      <div className="demo-watermark">
        <DocumentView meta={meta} content={content} profile={profile} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Search (/search?q=)                                                  */
/* ------------------------------------------------------------------ */

export function SearchPage() {
  const params = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const listings = useDemo((s) => s.listings)
  const lower = q.toLowerCase()
  const manuals = q ? SEED_MANUALS.filter((m) => `${m.title} ${m.model} ${m.brand}`.toLowerCase().includes(lower)) : []
  const models = q ? FINDER_MODELS.filter((m) => `${m.name} ${m.modelCode} ${m.brand} ${m.category}`.toLowerCase().includes(lower)) : []
  const items = q ? listings.filter((l) => `${l.title} ${l.model} ${l.brand}`.toLowerCase().includes(lower)) : []
  const businesses = q ? COMPANIES.filter((c) => `${c.name} ${c.suburb} ${c.description}`.toLowerCase().includes(lower)) : []
  const total = manuals.length + models.length + items.length + businesses.length
  const Group = ({ title, rows }: { title: string; rows: Array<{ href: string; label: string; hint: string }> }) =>
    rows.length === 0 ? null : (
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">{title}</h2>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.href}>
              <Link href={row.href} className="block rounded-md border border-line bg-paper p-4 hover:border-signal">
                <span className="block font-medium text-graphite">{row.label}</span>
                <span className="block text-sm text-zinc-deep">{row.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-graphite">Search</h1>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          navigate(`/search?q=${encodeURIComponent(String(new FormData(event.currentTarget).get('q') ?? ''))}`, { replace: true })
        }}
      >
        <Input name="q" type="search" defaultValue={q} placeholder="Model, brand, part or business" aria-label="Search Doorlink" />
        <Button type="submit">Search</Button>
      </form>
      {q && <p className="mt-4 text-sm text-zinc-deep">{total} result{total === 1 ? '' : 's'} for “{q}”</p>}
      <Group title="Products" rows={models.map((m) => ({ href: `/model/${m.id}`, label: `${m.brand} ${m.name}`, hint: `${m.modelCode} · ${m.category}` }))} />
      <Group title="Manuals" rows={manuals.map((m) => ({ href: `/manuals/${m.slug}`, label: m.title, hint: `${m.brand} · ${m.model}` }))} />
      <Group title="Marketplace" rows={items.map((l) => ({ href: `/marketplace/${l.id}`, label: l.title, hint: formatMoney(l.priceCents) }))} />
      <Group title="Businesses" rows={businesses.map((c) => ({ href: `/businesses/${c.id}`, label: c.name, hint: `${c.suburb} · ★ ${c.rating.toFixed(1)}` }))} />
      {q && total === 0 && <div className="mt-6"><EmptyState title="Nothing matched" description="Try a model code like S240, a brand like Bluegum, or a part like remote." /></div>}
      {!q && <p className="mt-6 text-sm text-graphite-soft">Try “S240”, “Bluegum”, “remote” or “Liverpool”.</p>}
      <p className="mt-10 text-micro text-zinc-deep">All results are demo data. {getDemo().listings.length} listings, {SEED_MANUALS.length} manuals.</p>
    </div>
  )
}
