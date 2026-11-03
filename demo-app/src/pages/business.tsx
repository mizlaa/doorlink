import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { JobStatus as PrismaJobStatus } from '@prisma/client'
import { formatBudgetRange, formatMoney } from '@/lib/money'
import { calculateSplit, DEFAULT_COMMISSION_BPS, formatCommissionRate } from '@/lib/commission'
import { describeSpec } from '@/lib/configurator/options'
import { sizeRangeLabel } from '@/lib/pricing/describe'
import { gstBreakdown, type RuleTerms } from '@/lib/pricing/engine'
import { accessoryLabel } from '@/lib/pricing/accessories'
import { INSTALLATION_LABELS, motorLabel, PRICED_PRODUCTS, productLabel, styleLabel } from '@/lib/pricing/products'
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_TONE,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONE,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONE,
  URGENCY_LABELS,
  URGENCY_TONE,
} from '@/lib/labels'
import { PricingRuleForm, type RuleFormValues } from '@/app/pricing/PricingRuleForm'
import { QuoteForm } from '@/app/leads/QuoteForm'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Table, Td, Th } from '@/components/ui/Table'
import { navigate } from '../router'
import {
  makeId,
  notify,
  update,
  useDemo,
  type AutomatedQuote,
  type DemoSession,
  type Lead,
  type Listing,
} from '../demo/store'
import { COMPANIES, companyById, type Company } from '../demo/data'
import { FINDER_MODELS } from '../demo/catalogue'
import { SEED_MANUALS } from '../demo/data'
import { businessCard, reviewsFor } from '../demo/cards'
import { pricingBusinessFor, pricingHref, setAdminPricingTarget } from '../demo/pricing-target'
import { deleteRuleAction, toggleRuleAction } from '../actions/pricing'
import { DemoTag, InlineConfirm, SignInPrompt } from './shared'
import { NotFoundPage } from './NotFound'

const FEE_BPS = DEFAULT_COMMISSION_BPS

/* ------------------------------------------------------------------ */
/* Job board (src/app/leads/page.tsx)                                  */
/* ------------------------------------------------------------------ */

const LEAD_STATUS: Record<Lead['status'], 'OPEN_FOR_QUOTES' | 'QUOTED' | 'ASSIGNED' | 'CLOSED'> = {
  Open: 'OPEN_FOR_QUOTES',
  Quoted: 'QUOTED',
  Scheduled: 'ASSIGNED',
  Closed: 'CLOSED',
}

const CATEGORY_PRODUCTS: Record<string, string[]> = {
  'Garage doors': ['GARAGE_DOOR'],
  Gates: ['SLIDING_GATE', 'SWING_GATE', 'PEDESTRIAN_GATE'],
  Shutters: ['WINDOW_SHUTTER', 'SHOP_SHUTTER'],
  Fencing: ['FENCE'],
}

function covers(company: Company, postcode: string): boolean {
  return company.coverage.some((band) => postcode >= band.from && postcode <= band.to)
}

function matchLead(lead: Lead, company: Company | undefined) {
  const reasons: string[] = []
  if (!company) return { score: 0, reasons }
  if (covers(company, lead.postcode)) reasons.push('In your area')
  const wanted = CATEGORY_PRODUCTS[lead.category]
  if (!wanted || wanted.some((p) => company.products.includes(p as Company['products'][number]))) reasons.push('A service you offer')
  return { score: reasons.length, reasons }
}

export function LeadsPage() {
  const session = useDemo((s) => s.session)
  const leads = useDemo((s) => s.leads)
  if (!session) return <SignInPrompt next="/leads" title="Sign in to see the job board" />
  if (session.role !== 'TECHNICIAN' || !session.companyId) {
    return (
      <div className="mx-auto max-w-prose px-4 py-16">
        <h1 className="text-xl font-semibold text-graphite">The job board is for technicians</h1>
        <p className="mt-2 text-sm text-graphite-soft">
          Installers and technicians quote on local jobs here. Try it with the demo installer account from{' '}
          <Link href="/sign-in" className="font-medium text-signal hover:text-signal-hover">
            Sign in
          </Link>
          .
        </p>
      </div>
    )
  }
  const company = companyById(session.companyId)
  const companyId = session.companyId
  const openLeads = leads.filter((l) => l.status === 'Open' || l.status === 'Quoted')
  const matched = openLeads
    .map((lead) => ({ lead, match: matchLead(lead, company) }))
    .sort((a, b) => b.match.score - a.match.score || (a.lead.createdAt < b.lead.createdAt ? 1 : -1))
  const matchingCount = matched.filter((m) => m.match.score > 0).length
  const myQuotes = leads.filter((l) => l.responses.some((r) => r.companyId === companyId))

  return (
    <div className="mx-auto flex max-w-shell flex-col gap-10 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-graphite">Job board</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-deep">Quote on local jobs. Contact details are shared once you&rsquo;re hired.</p>
        {matchingCount > 0 && (
          <p className="mt-2 max-w-prose text-sm text-graphite-soft">
            {matchingCount} of these {matchingCount === 1 ? 'is' : 'are'} in a postcode you cover or a service you offer, and{' '}
            {matchingCount === 1 ? 'is' : 'are'} listed first.
          </p>
        )}
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Open jobs ({openLeads.length})</h2>
        {openLeads.length === 0 ? (
          <EmptyState title="No open jobs right now" description="New customer requests will appear here as they're posted." />
        ) : (
          <ul className="flex flex-col gap-4">
            {matched.map(({ lead, match }) => {
              const mine = lead.responses.find((r) => r.companyId === companyId)
              const budget = formatBudgetRange(
                lead.budgetFromAUD !== null ? lead.budgetFromAUD * 100 : null,
                lead.budgetToAUD !== null ? lead.budgetToAUD * 100 : null
              )
              const location = [lead.suburb, lead.state, lead.postcode].filter(Boolean).join(' ')
              const status = LEAD_STATUS[lead.status]
              return (
                <li key={lead.reference} className="rounded-md border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">{lead.title}</p>
                      <p className="mt-1 font-code text-micro text-zinc-deep">{lead.reference}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {match.reasons.length > 0 && <Badge tone="signal">{match.reasons.join(' · ')}</Badge>}
                      <Badge tone={URGENCY_TONE[lead.urgency]}>{URGENCY_LABELS[lead.urgency]}</Badge>
                      <Badge tone={LEAD_STATUS_TONE[status]}>{LEAD_STATUS_LABELS[status]}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-graphite-soft">{lead.description}</p>
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-deep">
                    <div>
                      <dt className="inline font-medium text-graphite-soft">Service: </dt>
                      <dd className="inline">{lead.category}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-graphite-soft">Location: </dt>
                      <dd className="inline">{location}</dd>
                    </div>
                    {budget && (
                      <div>
                        <dt className="inline font-medium text-graphite-soft">Budget: </dt>
                        <dd className="inline">{budget}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline font-medium text-graphite-soft">Prefers: </dt>
                      <dd className="inline">{lead.urgency === 'URGENT' ? 'As soon as possible' : 'Within 2 weeks'}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-graphite-soft">Quotes so far: </dt>
                      <dd className="inline">{lead.responses.length}</dd>
                    </div>
                  </dl>
                  <details className="mt-4 border-t border-line pt-4" open={Boolean(mine)}>
                    <summary className="cursor-pointer text-sm font-medium text-signal hover:text-signal-hover">
                      {mine ? `Your quote: ${formatMoney(Math.round(mine.priceAUD * 100))} | edit` : 'Send a quote'}
                    </summary>
                    <div className="mt-4">
                      <QuoteForm
                        leadId={lead.reference}
                        commissionRateBps={FEE_BPS}
                        existing={mine ? { amountCents: Math.round(mine.priceAUD * 100), message: mine.message } : null}
                      />
                    </div>
                  </details>
                  {mine && (
                    <div className="mt-4">
                      <AskCustomerButton lead={lead} session={session} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Your quotes ({myQuotes.length})</h2>
        {myQuotes.length === 0 ? (
          <EmptyState title="You haven't quoted on anything yet" />
        ) : (
          <ul className="flex flex-col gap-3">
            {myQuotes.map((lead) => {
              const mine = lead.responses.find((r) => r.companyId === companyId)!
              const status =
                lead.acceptedCompanyId === companyId ? 'ACCEPTED' : lead.status === 'Scheduled' || lead.status === 'Closed' ? 'DECLINED' : 'PENDING'
              return (
                <li key={lead.reference} className="rounded-md border border-line bg-paper p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">{lead.title}</p>
                      <p className="mt-1 font-code text-micro text-zinc-deep">{lead.reference}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-medium text-graphite">{formatMoney(Math.round(mine.priceAUD * 100))}</span>
                      <Badge tone={QUOTE_STATUS_TONE[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>
                    </div>
                  </div>
                  {status === 'ACCEPTED' && (
                    <p className="mt-2 text-sm text-good">
                      Accepted. This job is now in your{' '}
                      <Link href="/jobs" className="font-medium underline">
                        jobs list
                      </Link>
                      .
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function AskCustomerButton({ lead, session }: { lead: Lead; session: DemoSession }) {
  return (
    <button
      type="button"
      className="text-sm font-medium text-signal hover:text-signal-hover"
      onClick={() => {
        const id = makeId('c')
        update((s) => {
          s.conversations.unshift({
            id,
            ownerUserId: session.userId,
            withName: `${lead.contactName.split(' ')[0]} (customer, ${lead.reference})`,
            subject: lead.title,
            unread: 0,
            messages: [
              {
                from: 'me',
                text: `Hi, ${session.name.split(' ')[0]} here from ${companyById(session.companyId ?? '')?.name ?? 'our team'}. A quick question about the job before we book it in.`,
                at: new Date().toISOString(),
              },
            ],
          })
        })
        navigate(`/messages/${id}`)
      }}
    >
      Ask the customer a question
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Business dashboard / automated pricing (src/app/pricing/*)          */
/* ------------------------------------------------------------------ */

function usePricingAccess(): { session: DemoSession | null; companyId: string | null } {
  const session = useDemo((s) => s.session)
  const params = useSearchParams()
  if (session?.role === 'ADMIN') setAdminPricingTarget(params.get('business'))
  return { session, companyId: pricingBusinessFor(session) }
}

function PricingShell({ session, companyId, children }: { session: DemoSession | null; companyId: string | null; children: ReactNode }) {
  const status = useDemo((s) => s.businessStatus)
  const details = useDemo((s) => s.businessDetails)
  const rules = useDemo((s) => s.rules)
  if (!session) return <SignInPrompt next="/pricing" title="Sign in to manage your prices" />
  if (!companyId) {
    return (
      <div className="mx-auto max-w-prose px-4 py-16">
        <h1 className="text-xl font-semibold text-graphite">Automated pricing is for businesses</h1>
        <p className="mt-2 text-sm text-graphite-soft">
          Technician and supplier accounts set their own prices here. To get a price for your design, use{' '}
          <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
            Design
          </Link>{' '}
          and choose a company.
        </p>
      </div>
    )
  }
  const company = companyById(companyId)!
  const businessStatus = status[companyId] ?? 'APPROVED'
  const name = details[companyId]?.businessName || company.name
  const priceCount = (rules[companyId] ?? []).filter((r) => r.active).length
  const tabs = [
    { href: '/pricing', label: 'Prices' },
    { href: '/pricing/quotes', label: 'Quotes & jobs' },
    { href: '/pricing/profile', label: 'Profile' },
    { href: '/pricing/payments', label: 'Payments' },
    { href: '/pricing/business', label: 'Details' },
  ]

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      {session.role === 'ADMIN' && (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-dashed border-signal/40 bg-signal-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-graphite">
            <span className="font-semibold">Admin:</span> editing this business&rsquo;s prices. Changes apply to the next customer comparison.
          </p>
          <label className="flex items-center gap-2 text-sm text-graphite">
            <span className="sr-only">Business</span>
            <Select
              aria-label="Business"
              value={companyId}
              onChange={(e) => navigate(`/pricing?business=${e.target.value}`)}
              className="h-9 max-w-[16rem]"
            >
              {COMPANIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      )}
      {businessStatus === 'SUSPENDED' ? (
        <div role="status" className="mb-6 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-graphite">
          <p className="font-semibold">Your business is suspended.</p>
          <p className="mt-1">Customers can’t see it or book it. Contact Doorlink support for details.</p>
        </div>
      ) : businessStatus === 'PENDING' ? (
        <div role="status" className="mb-6 rounded-lg border border-caution/30 bg-caution-tint px-4 py-3 text-sm text-graphite">
          <p className="font-semibold">Waiting for Doorlink approval</p>
          <p className="mt-1 text-graphite-soft">Customers can’t see your business until it’s approved.</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {[
              { label: 'Business details', done: true },
              { label: 'At least one price', done: priceCount > 0 },
              { label: 'Service area', done: company.coverage.length > 0 },
              { label: 'Trade subscription', done: true },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span aria-hidden="true" className={item.done ? 'text-good' : 'text-zinc-deep'}>
                  {item.done ? '✓' : '○'}
                </span>
                <span className={item.done ? 'text-graphite-soft line-through' : ''}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Business dashboard</p>
          <h1 className="text-2xl font-semibold text-graphite">{name}</h1>
          <p className="mt-1 text-sm text-graphite-soft">
            {businessStatus === 'APPROVED' ? 'Live on Doorlink. ' : ''}Your prices and settings are private to your business.
          </p>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border border-line bg-rail p-1 text-sm font-medium" aria-label="Your business">
          {tabs.map((tab) => (
            <Link key={tab.href} href={pricingHref(session, tab.href)} className="shrink-0 rounded-md px-3 py-1.5 text-graphite hover:bg-paper">
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}

const PRODUCT_ORDER = PRICED_PRODUCTS.map((p) => p.id)

function sortRules(rules: RuleTerms[]): RuleTerms[] {
  return [...rules].sort(
    (a, b) =>
      PRODUCT_ORDER.indexOf(a.product) - PRODUCT_ORDER.indexOf(b.product) ||
      (a.productBrand ?? '').localeCompare(b.productBrand ?? '') ||
      (a.productStyle ?? '').localeCompare(b.productStyle ?? '') ||
      a.minWidthMm - b.minWidthMm ||
      a.minHeightMm - b.minHeightMm ||
      Number(b.motorIncluded) - Number(a.motorIncluded)
  )
}

export function PricingPage() {
  const { session, companyId } = usePricingAccess()
  const allRules = useDemo((s) => s.rules)
  const params = useSearchParams()
  const [overlap, setOverlap] = useState<string | null>(null)
  const rules = sortRules(companyId ? allRules[companyId] ?? [] : [])
  const feeExample = calculateSplit(500_000, FEE_BPS)
  const byProduct = PRICED_PRODUCTS.map((product) => ({
    product,
    rules: rules.filter((rule) => rule.product === product.id),
  })).filter((group) => group.rules.length > 0)

  return (
    <PricingShell session={session} companyId={companyId}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-labelledby="prices-heading" className="min-w-0">
          <h2 id="prices-heading" className="text-sm font-medium text-graphite">
            Your prices
          </h2>
          <p className="mt-1 text-sm text-zinc-deep">
            Doorlink fee: {formatCommissionRate(FEE_BPS)} of each job booked through Doorlink, from your side. Customers pay your quoted price;
            on a $5,000 job you receive {formatMoney(feeExample.workerPayoutCents)}.
          </p>
          {params.get('saved') && (
            <p className="mt-2 text-sm text-good">
              Saved. The next customer comparison uses this price.{' '}
              <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
                Try it in Design
              </Link>
            </p>
          )}
          {overlap && (
            <p role="alert" className="mt-2 text-sm text-bad">
              Not switched on: it would overlap your price for {overlap}.
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
                  <h3 className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">{product.label}</h3>
                  <ul className="flex flex-col gap-2">
                    {productRules.map((rule) => (
                      <RuleCard key={rule.id} rule={rule} session={session} onOverlap={setOverlap} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="add-heading" className="rounded-lg border border-line bg-paper p-5 shadow-panel lg:sticky lg:top-6 lg:self-start">
          <h2 id="add-heading" className="mb-4 text-sm font-medium text-graphite">
            Add a price
          </h2>
          <PricingRuleForm key={companyId ?? 'none'} />
        </section>
      </div>
    </PricingShell>
  )
}

function RuleCard({ rule, session, onOverlap }: { rule: RuleTerms; session: DemoSession | null; onOverlap: (s: string | null) => void }) {
  const breakdown = gstBreakdown(rule.priceCents, rule.gst)
  const style = styleLabel(rule.productStyle)
  const form = (id: string) => {
    const data = new FormData()
    data.set('id', id)
    return data
  }
  return (
    <li className={`rounded-lg border border-line bg-paper p-4 ${rule.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-graphite">
            {[rule.productBrand ?? 'No brand named', rule.productModel, style].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-0.5 font-code text-sm text-graphite-soft">{sizeRangeLabel(rule)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>
              {rule.motorIncluded ? `Motor${rule.motorBrand ? `: ${motorLabel(rule.product, rule.motorBrand)}` : ' included'}` : 'No motor'}
            </Badge>
            <Badge>{INSTALLATION_LABELS[rule.installation]}</Badge>
            {rule.priceType === 'ESTIMATE' && <Badge tone="caution">Estimate</Badge>}
            {rule.material && <Badge>{rule.material.replace('-', ' ')}</Badge>}
            {rule.motorAddOnCents !== null && rule.motorAddOnCents !== undefined && <Badge>Motor add-on {formatMoney(rule.motorAddOnCents)}</Badge>}
            {!rule.active && <Badge tone="caution">Off</Badge>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-graphite">
            {formatMoney(rule.priceCents)}
            <span className="ml-1 text-sm font-normal text-zinc-deep">{rule.gst === 'EXCLUSIVE' ? '+ GST' : 'inc GST'}</span>
          </p>
          <p className="text-micro text-zinc-deep">
            {rule.gst === 'EXCLUSIVE' ? `${formatMoney(breakdown.totalIncGstCents)} inc GST` : `${formatMoney(breakdown.subtotalExGstCents)} ex GST`}
            {rule.installation === 'SEPARATE' && rule.installPriceCents ? ` · install ${formatMoney(rule.installPriceCents)}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-sm">
        <Link href={pricingHref(session, `/pricing/${rule.id}`)} className="font-medium text-signal hover:text-signal-hover">
          Edit
        </Link>
        <button
          type="button"
          className="font-medium text-graphite-soft hover:text-graphite"
          onClick={async () => onOverlap(await toggleRuleAction(form(rule.id)))}
        >
          {rule.active ? 'Switch off' : 'Switch on'}
        </button>
        <InlineConfirm
          label="Delete"
          question="Delete this price? Issued quotes keep their copy."
          confirmLabel="Yes, delete"
          onConfirm={() => void deleteRuleAction(form(rule.id))}
        />
      </div>
    </li>
  )
}

function dollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}

export function PricingEditPage({ params }: { params: Record<string, string> }) {
  const { session, companyId } = usePricingAccess()
  const allRules = useDemo((s) => s.rules)
  const rule = companyId ? (allRules[companyId] ?? []).find((r) => r.id === params.id) : undefined
  if (session && companyId && !rule) return <NotFoundPage />
  const initial: RuleFormValues | undefined = rule && {
    id: rule.id,
    product: rule.product,
    productStyle: rule.productStyle ?? '',
    productBrand: rule.productBrand ?? '',
    productModel: rule.productModel ?? '',
    material: rule.material ?? '',
    priceType: rule.priceType ?? 'FIXED',
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
  }
  return (
    <PricingShell session={session} companyId={companyId}>
      {initial && (
        <section className="max-w-2xl rounded-lg border border-line bg-paper p-5 shadow-panel">
          <h2 className="mb-4 text-sm font-medium text-graphite">Edit price</h2>
          <PricingRuleForm initial={initial} />
        </section>
      )}
    </PricingShell>
  )
}

export function PricingQuotesPage() {
  const { session, companyId } = usePricingAccess()
  const allQuotes = useDemo((s) => s.quotes)
  const jobs = useDemo((s) => s.jobs)
  const accounts = useDemo((s) => s.accounts)
  const quotes = companyId ? allQuotes.filter((q) => q.companyId === companyId) : []
  const requests = quotes.filter((q) => q.status === 'CUSTOM_REQUESTED')
  const booked = quotes.filter((q) => q.jobId)
  const issued = quotes.filter((q) => !q.jobId && q.status !== 'CUSTOM_REQUESTED')
  const firstName = (q: AutomatedQuote) =>
    (accounts.find((a) => `user-${a.role}-${a.email.split('@')[0].replace(/[^a-z0-9]/gi, '')}` === q.customerId)?.name ?? 'Customer').split(' ')[0]

  return (
    <PricingShell session={session} companyId={companyId}>
      {quotes.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="When a customer in your service area compares quotes and their design matches your prices, it appears here. Try it: sign in as the customer, design a door and get installed quotes."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {requests.length > 0 && (
            <section aria-labelledby="requests-heading">
              <h2 id="requests-heading" className="mb-3 text-sm font-medium text-graphite">
                Custom quote requests <Badge tone="caution">{requests.length}</Badge>
              </h2>
              <ul className="flex flex-col gap-3">
                {requests.map((quote) => (
                  <li key={quote.reference} className="rounded-lg border border-caution/40 bg-paper p-4">
                    <p className="font-medium text-graphite">
                      {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
                    </p>
                    <p className="text-sm text-zinc-deep">
                      {firstName(quote)} · {quote.postcode} · {quote.installRequired ? 'supply and install' : 'supply only'}
                      {quote.accessories.length > 0 && ` · ${quote.accessories.map(accessoryLabel).join(', ')}`}
                    </p>
                    <p className="mt-1 text-sm text-graphite-soft">
                      {describeSpec(quote.spec)
                        .slice(0, 8)
                        .map((r) => `${r.label}: ${r.value}`)
                        .join(' · ')}
                    </p>
                    {quote.customMessage && <p className="mt-2 rounded-md bg-rail px-3 py-2 text-sm text-graphite">“{quote.customMessage}”</p>}
                    <CustomReplyForm quote={quote} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {booked.length > 0 && (
            <section aria-labelledby="jobs-heading">
              <h2 id="jobs-heading" className="mb-3 text-sm font-medium text-graphite">
                Bookings
              </h2>
              <ul className="flex flex-col gap-2">
                {booked.map((quote) => {
                  const job = jobs.find((j) => j.id === quote.jobId)
                  if (!job) return null
                  const paid = job.payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + calculateSplit(p.grossCents, FEE_BPS).workerPayoutCents, 0)
                  return (
                    <li key={quote.reference}>
                      <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4 hover:border-signal">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 font-medium text-graphite">
                            {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
                            <Badge tone={JOB_STATUS_TONE[job.status as PrismaJobStatus]}>{JOB_STATUS_LABELS[job.status as PrismaJobStatus]}</Badge>
                          </span>
                          <span className="block text-sm text-zinc-deep">
                            {job.customerName.split(' ')[0]} · {new Date(quote.createdAt).toLocaleDateString('en-AU')}
                          </span>
                        </span>
                        <span className="text-right font-semibold text-graphite">
                          {formatMoney(job.agreedPriceCents)}
                          {paid > 0 && <span className="block text-micro font-normal text-zinc-deep">Paid to you so far {formatMoney(paid)} (simulated)</span>}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          {issued.length > 0 && (
            <section aria-labelledby="issued-heading">
              <h2 id="issued-heading" className="mb-3 text-sm font-medium text-graphite">
                Quotes issued
              </h2>
              <ul className="flex flex-col gap-2">
                {issued.map((quote) => (
                  <li key={quote.reference} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper p-4">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-graphite">
                        {productLabel(quote.product)} · {quote.widthMm} × {quote.heightMm} mm
                        {quote.status === 'DECLINED' && <Badge>Declined</Badge>}
                      </span>
                      <span className="block text-sm text-zinc-deep">
                        {firstName(quote)} · {quote.postcode} · {new Date(quote.createdAt).toLocaleDateString('en-AU')} ·{' '}
                        <span className="font-code">{quote.reference}</span>
                      </span>
                    </span>
                    {quote.options[0] && (
                      <span className="text-right font-semibold text-graphite">
                        {formatMoney(Math.min(...quote.options.map((o) => o.totalIncGstCents)))}
                        <span className="block text-micro font-normal text-zinc-deep">{quote.options.length > 1 ? 'from, inc GST' : 'inc GST'}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PricingShell>
  )
}

function CustomReplyForm({ quote }: { quote: AutomatedQuote }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="mt-3 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const amount = Number(String(data.get('amount') ?? '').replace(/[$,\s]/g, ''))
        const note = String(data.get('note') ?? '').trim()
        if (!Number.isFinite(amount) || amount <= 0) {
          setError('Enter your price, including GST.')
          return
        }
        const cents = Math.round(amount * 100)
        const gst = gstBreakdown(cents, 'INCLUSIVE')
        update((s) => {
          const q = s.quotes.find((x) => x.reference === quote.reference)
          if (!q) return
          q.status = 'ISSUED'
          q.options = [
            {
              id: makeId('opt'),
              ruleId: 'custom',
              productBrand: q.requestedBrand,
              motorIncluded: q.motorRequired,
              motorBrand: null,
              installation: q.installRequired ? 'INCLUDED' : 'NOT_INCLUDED',
              gst: 'INCLUSIVE',
              priceCents: cents,
              installPriceCents: null,
              subtotalExGstCents: gst.subtotalExGstCents,
              gstCents: gst.gstCents,
              totalIncGstCents: gst.totalIncGstCents,
              currency: 'AUD',
              note: note || null,
              priceType: 'FIXED',
              lines: [{ kind: 'base', label: 'Custom price for your design', amountCents: cents, gst: 'INCLUSIVE' }],
              unpricedAccessories: [],
            },
          ]
        })
        notify(quote.customerId, 'Your custom quote is ready', `${quote.businessName} priced your design at ${formatMoney(cents)} inc GST.`, `/quotes/${quote.reference}`)
      }}
    >
      <Field label="Your price (inc GST)" htmlFor={`amount-${quote.reference}`}>
        <Input id={`amount-${quote.reference}`} name="amount" inputMode="decimal" placeholder="3200" className="sm:w-40" />
      </Field>
      <div className="flex-1">
        <Field label="Note to the customer" htmlFor={`note-${quote.reference}`}>
          <Input id={`note-${quote.reference}`} name="note" placeholder="Includes removal of the old door" />
        </Field>
      </div>
      <Button type="submit">Send price</Button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  )
}

export function PricingProfilePage() {
  const { session, companyId } = usePricingAccess()
  const state = useDemo((s) => s)
  if (!companyId) return <PricingShell session={session} companyId={companyId}>{null}</PricingShell>
  const company = companyById(companyId)!
  const card = businessCard(companyId, state)
  return (
    <PricingShell session={session} companyId={companyId}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelBody className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-graphite">Public profile</h2>
            <p className="text-sm text-graphite-soft">{company.description}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-zinc-deep">Rating</dt>
                <dd className="font-medium text-graphite">
                  ★ {card.ratingAvg.toFixed(1)} ({card.ratingCount} reviews)
                </dd>
              </div>
              <div>
                <dt className="text-zinc-deep">Jobs completed</dt>
                <dd className="font-medium text-graphite">{card.jobsCompleted}</dd>
              </div>
              <div>
                <dt className="text-zinc-deep">Warranty</dt>
                <dd className="font-medium text-graphite">{company.warrantyYears} years</dd>
              </div>
              <div>
                <dt className="text-zinc-deep">Lead time</dt>
                <dd className="font-medium text-graphite">About {company.leadTimeDays} days</dd>
              </div>
              <div>
                <dt className="text-zinc-deep">Deposit</dt>
                <dd className="font-medium text-graphite">{company.depositPercent}% on booking</dd>
              </div>
              <div>
                <dt className="text-zinc-deep">Replies</dt>
                <dd className="font-medium text-graphite">{company.responseTime}</dd>
              </div>
            </dl>
            <Link href={`/businesses/${companyId}`} className="text-sm font-medium text-signal hover:text-signal-hover">
              View your public page →
            </Link>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelBody className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-graphite">What you offer</h2>
            <div className="flex flex-wrap gap-1.5">
              {company.products.map((p) => (
                <Badge key={p}>{productLabel(p)}</Badge>
              ))}
            </div>
            <h3 className="mt-2 text-sm font-medium text-graphite">Service area</h3>
            <ul className="text-sm text-graphite-soft">
              {company.coverage.map((band) => (
                <li key={band.from}>
                  Postcodes {band.from}–{band.to}
                  {band.travelFeeCents > 0 ? ` · travel fee ${formatMoney(band.travelFeeCents)}` : ' · no travel fee'}
                </li>
              ))}
            </ul>
            <h3 className="mt-2 text-sm font-medium text-graphite">Accessories you price</h3>
            <ul className="text-sm text-graphite-soft">
              {company.accessories.map((a) => (
                <li key={a.accessory}>
                  {accessoryLabel(a.accessory)} · {formatMoney(a.priceCents)} inc GST
                </li>
              ))}
            </ul>
            <p className="text-micro text-zinc-deep">Demo: profile editing is limited to business details in this preview.</p>
          </PanelBody>
        </Panel>
      </div>
    </PricingShell>
  )
}

export function PricingPaymentsPage() {
  const { session, companyId } = usePricingAccess()
  const jobs = useDemo((s) => s.jobs)
  const mine = companyId ? jobs.filter((j) => j.companyId === companyId) : []
  const rows = mine.flatMap((job) => job.payments.filter((p) => p.status === 'PAID').map((p) => ({ job, payment: p, split: calculateSplit(p.grossCents, FEE_BPS) })))
  const total = rows.reduce((sum, r) => sum + r.split.workerPayoutCents, 0)
  return (
    <PricingShell session={session} companyId={companyId}>
      <div className="flex flex-col gap-6">
        <Panel className="border-dashed border-caution/40 bg-caution-tint">
          <PanelBody className="text-sm text-graphite">
            <p className="flex items-center gap-2 font-medium">
              <DemoTag>Demo</DemoTag> Payouts are simulated
            </p>
            <p className="mt-1 text-graphite-soft">
              No bank account or card processor is connected. Payments below are the simulated ones from demo bookings, with Doorlink&rsquo;s{' '}
              {formatCommissionRate(FEE_BPS)} fee taken out.
            </p>
          </PanelBody>
        </Panel>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Paid to you (simulated)" value={formatMoney(total)} />
          <Stat label="Bookings" value={String(mine.length)} />
          <Stat label="Doorlink fee" value={formatCommissionRate(FEE_BPS)} />
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No payments yet" description="When a customer pays a deposit or balance on a demo booking, it shows here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Job</Th>
                <Th>Payment</Th>
                <Th>Customer paid</Th>
                <Th>Fee</Th>
                <Th>To you</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, payment, split }) => (
                <tr key={payment.id}>
                  <Td>
                    <Link href={`/jobs/${job.id}`} className="font-code text-signal hover:text-signal-hover">
                      {job.reference}
                    </Link>
                  </Td>
                  <Td>{payment.kind === 'DEPOSIT' ? 'Deposit' : payment.kind === 'BALANCE' ? 'Balance' : 'Full payment'}</Td>
                  <Td>{formatMoney(payment.grossCents)}</Td>
                  <Td>{formatMoney(split.commissionCents)}</Td>
                  <Td className="font-medium">{formatMoney(split.workerPayoutCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </PricingShell>
  )
}

export function PricingBusinessPage() {
  const { session, companyId } = usePricingAccess()
  const details = useDemo((s) => s.businessDetails)
  const [saved, setSaved] = useState(false)
  const current = companyId ? details[companyId] : undefined
  return (
    <PricingShell session={session} companyId={companyId}>
      {companyId && current && (
        <section className="max-w-2xl rounded-lg border border-line bg-paper p-5 shadow-panel">
          <h2 className="mb-1 text-sm font-medium text-graphite">Business details</h2>
          <p className="mb-4 text-sm text-zinc-deep">Shown to customers on your quotes, and used for quote alerts.</p>
          <form
            key={companyId}
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              update((s) => {
                s.businessDetails[companyId] = {
                  businessName: String(data.get('businessName') ?? '').trim() || current.businessName,
                  phone: String(data.get('phone') ?? '').trim(),
                  email: String(data.get('email') ?? '').trim(),
                  abn: String(data.get('abn') ?? '').trim(),
                }
              })
              setSaved(true)
            }}
          >
            <Field label="Business name" htmlFor="businessName">
              <Input id="businessName" name="businessName" defaultValue={current.businessName} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" type="tel" defaultValue={current.phone} />
              </Field>
              <Field label="Email for quote alerts" htmlFor="email" hint="Demo: no email is sent.">
                <Input id="email" name="email" type="email" defaultValue={current.email} />
              </Field>
            </div>
            <Field label="ABN" htmlFor="abn" hint="Optional. Fictional in the demo.">
              <Input id="abn" name="abn" defaultValue={current.abn} />
            </Field>
            <div className="flex items-center gap-4">
              <Button type="submit">Save details</Button>
              {saved && <p className="text-sm text-good">Business details saved.</p>}
            </div>
          </form>
        </section>
      )}
    </PricingShell>
  )
}

function Stat({ label, value, href, note }: { label: string; value: string; href?: string; note?: string }) {
  return (
    <Panel>
      <PanelBody>
        <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-graphite">{value}</p>
        {note && <p className="mt-1 text-micro text-zinc-deep">{note}</p>}
        {href && (
          <Link href={href} className="mt-2 inline-block text-sm font-medium text-signal hover:text-signal-hover">
            Manage →
          </Link>
        )}
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Supplier and manufacturer dashboard                                 */
/* ------------------------------------------------------------------ */

export function DashboardPage() {
  const session = useDemo((s) => s.session)
  const state = useDemo((s) => s)
  if (!session) return <SignInPrompt next="/dashboard" />
  if (!session.companyId) {
    return (
      <div className="mx-auto max-w-prose px-4 py-16">
        <h1 className="text-xl font-semibold text-graphite">The dashboard is for business accounts</h1>
        <p className="mt-2 text-sm text-graphite-soft">
          {session.role === 'ADMIN' ? (
            <>
              Admins have the{' '}
              <Link href="/admin" className="font-medium text-signal hover:text-signal-hover">
                admin overview
              </Link>{' '}
              instead.
            </>
          ) : (
            <>
              Your quotes and jobs are under{' '}
              <Link href="/quotes" className="font-medium text-signal hover:text-signal-hover">
                My quotes
              </Link>{' '}
              and{' '}
              <Link href="/jobs" className="font-medium text-signal hover:text-signal-hover">
                Jobs
              </Link>
              .
            </>
          )}
        </p>
      </div>
    )
  }
  const company = companyById(session.companyId)!
  const card = businessCard(company.id, state)
  const status = state.businessStatus[company.id] ?? 'APPROVED'
  const listings = state.listings.filter((l) => l.sellerCompanyId === company.id)
  const active = listings.filter((l) => l.status === 'ACTIVE')
  const enquiries = state.conversations.filter((c) => c.withName === company.name)
  const reviews = reviewsFor(company.id, state).slice(0, 3)
  const isManufacturer = session.role === 'MANUFACTURER'
  const brand = company.brand
  const models = brand ? FINDER_MODELS.filter((m) => m.brand === brand) : []
  const manuals = brand ? SEED_MANUALS.filter((m) => m.brand === brand) : []
  const dealers = brand
    ? COMPANIES.filter((c) => c.id !== company.id && state.listings.some((l) => l.sellerCompanyId === c.id && l.brand === brand))
    : []
  const quotes = state.quotes.filter((q) => q.companyId === company.id)
  const brandQuotes = brand ? state.quotes.filter((q) => q.options.some((o) => o.productBrand === brand)) : []
  const activeRules = (state.rules[company.id] ?? []).filter((r) => r.active).length

  return (
    <div className="mx-auto flex max-w-shell flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-3 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">
            {isManufacturer ? 'Manufacturer dashboard' : session.role === 'SUPPLIER' ? 'Supplier dashboard' : 'Business dashboard'}
          </p>
          <h1 className="text-2xl font-semibold text-graphite">{state.businessDetails[company.id]?.businessName || company.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={status === 'APPROVED' ? 'good' : status === 'PENDING' ? 'caution' : 'bad'}>
              {status === 'APPROVED' ? 'Live on Doorlink' : status === 'PENDING' ? 'Waiting for approval' : 'Suspended'}
            </Badge>
            {brand && <Badge>{isManufacturer ? `Makes ${brand}` : `Stockist: ${brand}`}</Badge>}
            <DemoTag />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/my-listings/new" className="inline-flex h-9 items-center rounded bg-signal px-4 font-medium text-paper hover:bg-signal-hover">
            New listing
          </Link>
          {isManufacturer ? (
            <Link href="/admin/models" className="inline-flex h-9 items-center rounded border border-line px-4 font-medium text-graphite hover:bg-rail">
              Catalogue
            </Link>
          ) : (
            <Link href="/pricing" className="inline-flex h-9 items-center rounded border border-line px-4 font-medium text-graphite hover:bg-rail">
              Automated pricing
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active listings" value={String(active.length)} note={`${listings.reduce((n, l) => n + l.stock, 0)} units in stock`} href="/my-listings" />
        {isManufacturer ? (
          <>
            <Stat label="Catalogue models" value={String(models.length)} note={brand ?? undefined} href="/admin/models" />
            <Stat label="Dealers stocking you" value={String(dealers.length)} />
            <Stat label="Manuals published" value={String(manuals.length)} href="/admin/manuals" />
          </>
        ) : (
          <>
            <Stat label="Prices switched on" value={String(activeRules)} href="/pricing" />
            <Stat label="Quotes issued" value={String(quotes.length)} href="/pricing/quotes" />
            <Stat label="Rating" value={`★ ${card.ratingAvg.toFixed(1)}`} note={`${card.ratingCount} reviews`} />
          </>
        )}
      </div>

      {isManufacturer ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Your catalogue</h2>
            {models.length === 0 ? (
              <EmptyState title="No models yet" />
            ) : (
              <ul className="flex flex-col gap-2">
                {models.map((m) => (
                  <li key={m.id}>
                    <Link href={`/model/${m.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 hover:border-signal">
                      <span className="min-w-0">
                        <span className="block font-medium text-graphite">{m.name}</span>
                        <span className="block text-sm text-zinc-deep">
                          <span className="font-code">{m.modelCode}</span> · {m.category}
                        </span>
                      </span>
                      <span className="text-sm text-zinc-deep">{SEED_MANUALS.filter((x) => x.model === m.modelCode).length} manuals</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Dealers and installers</h2>
            {dealers.length === 0 ? (
              <EmptyState title="No dealers listing your products yet" />
            ) : (
              <ul className="flex flex-col gap-2">
                {dealers.map((d) => (
                  <li key={d.id}>
                    <Link href={`/businesses/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 hover:border-signal">
                      <span>
                        <span className="block font-medium text-graphite">{d.name}</span>
                        <span className="block text-sm text-zinc-deep">{d.suburb}</span>
                      </span>
                      <span className="text-sm text-zinc-deep">
                        {state.listings.filter((l) => l.sellerCompanyId === d.id && l.brand === brand).length} listings
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Quotes naming {brand}</h2>
            <p className="text-sm text-graphite-soft">
              {brandQuotes.length === 0
                ? 'No customer quotes have named your brand yet in this demo session.'
                : `${brandQuotes.length} customer quote${brandQuotes.length === 1 ? '' : 's'} included a ${brand} option.`}
            </p>
          </section>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Recent quotes</h2>
            {quotes.length === 0 ? (
              <EmptyState
                title="No quotes yet"
                description="Quotes appear when a customer's design matches your prices. Sign in as the customer and compare quotes to see one arrive."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {quotes.slice(0, 5).map((q) => (
                  <li key={q.reference} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4">
                    <span className="min-w-0">
                      <span className="block font-medium text-graphite">
                        {productLabel(q.product)} · {q.widthMm} × {q.heightMm} mm
                      </span>
                      <span className="block font-code text-sm text-zinc-deep">{q.reference}</span>
                    </span>
                    <span className="font-semibold text-graphite">{q.options[0] ? formatMoney(q.options[0].totalIncGstCents) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Stock running low</h2>
            <ul className="flex flex-col gap-2">
              {[...listings]
                .sort((a, b) => a.stock - b.stock)
                .slice(0, 4)
                .map((l) => (
                  <li key={l.id}>
                    <Link href={`/my-listings/${l.id}/edit`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 hover:border-signal">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-graphite">{l.title}</span>
                        <span className="block font-code text-sm text-zinc-deep">{l.model}</span>
                      </span>
                      <Badge tone={l.stock <= 3 ? 'caution' : 'neutral'}>{l.stock} left</Badge>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Enquiries</h2>
          {enquiries.length === 0 ? (
            <EmptyState title="No enquiries yet" description="When a buyer messages you about a listing, it appears here." />
          ) : (
            <ul className="flex flex-col gap-2">
              {enquiries.map((c) => (
                <li key={c.id}>
                  <Link href={`/messages/${c.id}`} className="block rounded-lg border border-line bg-paper p-4 hover:border-signal">
                    <span className="block font-medium text-graphite">{c.subject}</span>
                    <span className="block truncate text-sm text-zinc-deep">{c.messages[c.messages.length - 1]?.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Latest reviews</h2>
          <ul className="flex flex-col gap-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-paper p-4">
                <p className="text-sm font-medium text-graphite">
                  <span className="text-caution" aria-label={`${r.rating} out of 5`}>
                    {'★'.repeat(r.rating)}
                  </span>{' '}
                  {r.author} · {r.when}
                </p>
                <p className="mt-1 text-sm text-graphite-soft">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* My listings (src/app/my-listings/*)                                 */
/* ------------------------------------------------------------------ */

function ownsListing(listing: Listing, session: DemoSession): boolean {
  if (listing.ownerUserId) return listing.ownerUserId === session.userId
  return Boolean(session.companyId) && listing.sellerCompanyId === session.companyId
}

export function MyListingsPage() {
  const session = useDemo((s) => s.session)
  const listings = useDemo((s) => s.listings)
  if (!session) return <SignInPrompt next="/my-listings" />
  const mine = listings.filter((l) => ownsListing(l, session))
  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <div className="mb-6 flex flex-col gap-1 border-b border-line pb-6">
        <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Marketplace</p>
        <h1 className="text-2xl font-semibold text-graphite">My listings</h1>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-graphite">Your listings</h2>
          <Link href="/my-listings/new" className="inline-flex h-9 items-center justify-center rounded bg-signal px-4 text-sm font-medium text-paper hover:bg-signal-hover">
            New listing
          </Link>
        </div>
        {mine.length === 0 ? (
          <EmptyState title="No listings yet" description="Create your first listing to appear on the marketplace." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Model</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {mine.map((listing) => (
                <tr key={listing.id}>
                  <Td>
                    <Link href={`/marketplace/${listing.id}`} className="hover:text-signal">
                      {listing.title}
                    </Link>
                  </Td>
                  <Td className="font-code">{listing.model}</Td>
                  <Td>{formatMoney(listing.priceCents)}</Td>
                  <Td>{listing.stock}</Td>
                  <Td>
                    <Badge tone={listing.status === 'ACTIVE' ? 'good' : 'neutral'}>{listing.status}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/my-listings/${listing.id}/edit`} className="text-sm font-medium text-signal hover:text-signal-hover">
                        Edit
                      </Link>
                      <InlineConfirm
                        label="Delete"
                        question="Delete this listing?"
                        confirmLabel="Yes, delete"
                        onConfirm={() =>
                          update((s) => {
                            s.listings = s.listings.filter((l) => l.id !== listing.id)
                          })
                        }
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}

const LISTING_CONDITIONS: Array<{ value: Listing['condition']; label: string }> = [
  { value: 'NEW', label: 'New' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'USED_LIKE_NEW', label: 'Used, like new' },
  { value: 'USED_GOOD', label: 'Used, good' },
]

export function ListingFormPage({ params }: { params: Record<string, string> }) {
  const session = useDemo((s) => s.session)
  const listings = useDemo((s) => s.listings)
  const [error, setError] = useState<string | null>(null)
  const editing = params.id ? listings.find((l) => l.id === params.id) : undefined
  if (!session) return <SignInPrompt next="/my-listings/new" />
  if (params.id && (!editing || !ownsListing(editing, session))) return <NotFoundPage />

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/my-listings" className="text-sm font-medium text-signal hover:text-signal-hover">
        ← My listings
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-graphite">{editing ? 'Edit listing' : 'New listing'}</h1>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const model = FINDER_MODELS.find((m) => m.id === data.get('modelId'))
          const title = String(data.get('title') ?? '').trim()
          const price = Number(String(data.get('price') ?? '').replace(/[$,\s]/g, ''))
          const stock = Number(data.get('stockQty') ?? 0)
          if (!model) return setError('Choose the model you are selling.')
          if (title.length < 4) return setError('Give the listing a title.')
          if (!Number.isFinite(price) || price <= 0) return setError('Enter a price greater than zero.')
          const company = session.companyId ? companyById(session.companyId) : undefined
          const values = {
            title,
            category: model.category,
            brand: model.brand,
            model: model.modelCode,
            condition: String(data.get('condition')) as Listing['condition'],
            priceCents: Math.round(price * 100),
            stock: Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : 0,
            description: String(data.get('description') ?? '').trim() || model.summary,
            status: String(data.get('status')) as Listing['status'],
          }
          const id = editing?.id ?? makeId('LST-')
          update((s) => {
            if (editing) {
              const target = s.listings.find((l) => l.id === editing.id)
              if (target) Object.assign(target, values)
            } else {
              s.listings.unshift({
                id,
                ...values,
                sellerCompanyId: company?.id ?? '',
                ownerUserId: company ? undefined : session.userId,
                sellerName: company ? undefined : session.name,
                suburb: company?.suburb ?? 'Sydney',
                createdAt: new Date().toISOString(),
              })
            }
          })
          navigate('/my-listings')
        }}
      >
        <Field label="Model" htmlFor="modelId">
          <Select id="modelId" name="modelId" defaultValue={FINDER_MODELS.find((m) => m.modelCode === editing?.model)?.id}>
            {FINDER_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.modelCode} | {m.brand} {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Listing title" htmlFor="title">
          <Input id="title" name="title" required defaultValue={editing?.title} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price (AUD)" htmlFor="price">
            <Input id="price" name="price" inputMode="decimal" required defaultValue={editing ? String(editing.priceCents / 100) : ''} />
          </Field>
          <Field label="Stock quantity" htmlFor="stockQty">
            <Input id="stockQty" name="stockQty" type="number" min="0" defaultValue={editing?.stock ?? 1} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Condition" htmlFor="condition">
            <Select id="condition" name="condition" defaultValue={editing?.condition ?? 'NEW'}>
              {LISTING_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status" hint="Only Active listings appear on the public marketplace.">
            <Select id="status" name="status" defaultValue={editing?.status ?? 'ACTIVE'}>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
            </Select>
          </Field>
        </div>
        <Field label="Description" htmlFor="description" hint="Optional. Defaults to the model's summary.">
          <Textarea id="description" name="description" defaultValue={editing?.description} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <Button type="submit">{editing ? 'Save changes' : 'Create listing'}</Button>
          <Link href="/my-listings" className="text-sm font-medium text-signal hover:text-signal-hover">
            Cancel
          </Link>
        </div>
        <p className="text-micro text-zinc-deep">Demo: listings stay in this browser. Nothing is published or sold.</p>
      </form>
    </div>
  )
}
