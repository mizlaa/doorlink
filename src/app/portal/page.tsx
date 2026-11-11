import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppointmentStatus, InvoicePaymentStatus, InvoiceStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { KIND_LABELS } from '@/lib/appointments/rules'
import { logoUrl } from '@/lib/branding/brand'
import { describeSpec, parseSpec } from '@/lib/configurator/options'
import { invoiceNumberLabel, PAYMENT_STATE_LABELS, paymentState, receiptNumberLabel } from '@/lib/invoices/money'
import { JOB_STATUS_LABELS } from '@/lib/labels'
import { formatMoney } from '@/lib/money'
import { businessCard, decodeBusinessKey } from '@/lib/pricing/business'
import { prisma } from '@/lib/prisma'
import { formatInZone, formatTimeRange } from '@/lib/timezone'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'My home', robots: { index: false } }

const REQUEST_LABELS = { OPEN: 'Waiting for a company', ACCEPTED: 'Accepted', CANCELLED: 'Cancelled', CLOSED: 'No company took it' } as Record<string, string>

/**
 * The customer's own records, in one place: designs, requests and quotes,
 * visits, invoices and receipts. Every query is keyed on the signed-in
 * customer, and each company's work carries that company's name and logo.
 */
export default async function PortalPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/portal')
  const only = (await searchParams).company ?? null
  const mine = { userId: session.userId }
  const businessFilter = only ? { business: { businessKey: only } } : {}

  const [designs, requests, quotes, jobs, visits, invoices] = await Promise.all([
    only ? Promise.resolve([]) : prisma.doorConfiguration.findMany({ where: { userId: session.userId }, orderBy: { updatedAt: 'desc' }, take: 6, select: { id: true, name: true, spec: true } }),
    only ? Promise.resolve([]) : prisma.serviceRequest.findMany({ where: { customerId: session.userId }, orderBy: { createdAt: 'desc' }, take: 10, select: { reference: true, status: true, suburb: true, createdAt: true, widthMm: true, heightMm: true } }),
    only ? Promise.resolve([]) : prisma.automatedQuote.findMany({ where: { customerId: session.userId }, orderBy: { createdAt: 'desc' }, take: 10, select: { reference: true, businessName: true, status: true, createdAt: true } }),
    prisma.job.findMany({ where: { customerId: session.userId, ...businessFilter }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, reference: true, title: true, description: true, status: true, business: { select: { businessKey: true } } } }),
    prisma.appointment.findMany({
      where: { customer: mine, ...businessFilter, status: { in: [AppointmentStatus.BOOKED, AppointmentStatus.EN_ROUTE, AppointmentStatus.IN_PROGRESS] }, endsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 10,
      select: { id: true, kind: true, status: true, startsAt: true, endsAt: true, jobId: true, technician: { select: { name: true } }, business: { select: { businessKey: true, timezone: true } }, property: { select: { addressLine: true, suburb: true } } },
    }),
    prisma.invoice.findMany({
      where: { customer: mine, ...businessFilter, status: { not: InvoiceStatus.DRAFT } },
      orderBy: { issuedAt: 'desc' },
      take: 30,
      select: { id: true, number: true, status: true, totalCents: true, paidCents: true, dueDate: true, currency: true, logoVersionId: true, business: { select: { businessKey: true } }, payments: { where: { status: InvoicePaymentStatus.CONFIRMED }, select: { id: true, receiptNumber: true, amountCents: true } } },
    }),
  ])

  const keys = [...new Set([...jobs.map((j) => j.business?.businessKey), ...visits.map((v) => v.business.businessKey), ...invoices.map((i) => i.business.businessKey)].filter((k): k is string => !!k))]
  const cards = new Map((await Promise.all(keys.map(async (k) => [k, await brandFor(k)] as const))).filter((entry): entry is readonly [string, { name: string; logo: string | null }] => !!entry[1]))
  const company = only ? cards.get(only) : null
  const owing = invoices.filter((i) => i.status === InvoiceStatus.ISSUED && i.paidCents < i.totalCents)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      {company ? (
        <header className="mb-6 flex items-center gap-4">
          {company.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- the company's own logo
            <img src={company.logo} alt="" className="h-12 max-w-[10rem] object-contain" />
          )}
          <div>
            <h1 className="text-2xl font-semibold text-graphite">{company.name}</h1>
            <Link href="/portal" className="text-sm font-medium text-signal hover:text-signal-hover">
              All my companies
            </Link>
          </div>
        </header>
      ) : (
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-graphite">My home</h1>
          <p className="mt-1 text-sm text-graphite-soft">Your designs, requests, visits and invoices.</p>
        </header>
      )}

      {owing.length > 0 && (
        <Link href={`/invoices/${owing[0].id}`} className="mb-6 flex items-center justify-between gap-3 rounded-lg bg-signal p-4 text-paper hover:bg-signal-hover">
          <span>
            <span className="block font-semibold">
              {owing.length === 1 ? `Invoice ${invoiceNumberLabel(owing[0].number)} to pay` : `${owing.length} invoices to pay`}
            </span>
            <span className="text-sm opacity-90">{formatMoney(owing.reduce((s, i) => s + i.totalCents - i.paidCents, 0))} owing</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <Section title="Upcoming visits" empty={visits.length === 0 ? 'Nothing booked.' : null}>
        {visits.map((v) => (
          <Row
            key={v.id}
            href={v.jobId ? `/jobs/${v.jobId}` : null}
            title={`${KIND_LABELS[v.kind]} · ${formatInZone(v.startsAt, v.business.timezone, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTimeRange(v.startsAt, v.endsAt, v.business.timezone)}`}
            detail={[cards.get(v.business.businessKey)?.name, v.technician?.name, v.property ? `${v.property.addressLine}, ${v.property.suburb}` : null].filter(Boolean).join(' · ')}
          />
        ))}
      </Section>

      <Section title="Invoices and receipts" empty={invoices.length === 0 ? 'No invoices yet.' : null}>
        {invoices.map((i) => (
          <li key={i.id} className="py-3">
            <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 hover:text-signal">
              <span className="min-w-0">
                <span className="block font-medium text-graphite">
                  {cards.get(i.business.businessKey)?.name ?? 'Invoice'} · {invoiceNumberLabel(i.number)}
                </span>
                <span className="block text-micro text-zinc-deep">
                  {formatMoney(i.totalCents, i.currency)} · {PAYMENT_STATE_LABELS[paymentState(i)]}
                </span>
              </span>
              <span aria-hidden="true" className="text-zinc-deep">→</span>
            </Link>
            {i.payments.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-x-3 text-micro">
                {i.payments.map((p) => (
                  <a key={p.id} href={`/api/invoices/${i.id}/receipts/${p.id}`} className="font-medium text-signal hover:text-signal-hover">
                    Receipt {receiptNumberLabel(p.receiptNumber)} ({formatMoney(p.amountCents, i.currency)})
                  </a>
                ))}
              </span>
            )}
          </li>
        ))}
      </Section>

      <Section title="Jobs" empty={jobs.length === 0 ? 'No jobs yet.' : null}>
        {jobs.map((j) => (
          <Row key={j.id} href={`/jobs/${j.id}`} title={j.title ?? j.description.split('\n')[0]} detail={[j.business ? cards.get(j.business.businessKey)?.name : null, j.reference, JOB_STATUS_LABELS[j.status]].filter(Boolean).join(' · ')} />
        ))}
      </Section>

      {!only && (
        <>
          <Section title="Measure requests" empty={requests.length === 0 ? 'None yet. Request a free measure from the designer.' : null}>
            {requests.map((r) => (
              <Row key={r.reference} href={`/measure/${r.reference}`} title={`${r.widthMm} × ${r.heightMm} mm · ${r.suburb}`} detail={`${r.reference} · ${REQUEST_LABELS[r.status] ?? r.status}`} />
            ))}
          </Section>
          <Section title="Quotes" empty={quotes.length === 0 ? 'No quotes yet.' : null}>
            {quotes.map((q) => (
              <Row key={q.reference} href={`/quotes/${q.reference}`} title={q.businessName} detail={`${q.reference} · ${q.status === 'BOOKED' ? 'Booked' : q.status === 'ISSUED' ? 'Open' : q.status.toLowerCase()}`} />
            ))}
          </Section>
          <Section title="Designs" empty={designs.length === 0 ? 'No saved designs yet.' : null} action={{ href: '/configure', label: 'Design a door' }}>
            {designs.map((d) => {
              const spec = parseSpec(d.spec)
              return <Row key={d.id} href={`/configure?spec=${encodeURIComponent(JSON.stringify(spec))}`} title={d.name} detail={describeSpec(spec).slice(0, 3).map((r) => r.value).join(' · ')} />
            })}
          </Section>
          {cards.size > 0 && (
            <Section title="Your companies" empty={null}>
              {[...cards.entries()].map(([key, card]) => (
                <Row key={key} href={`/portal?company=${encodeURIComponent(key)}`} title={card.name} detail="Their visits, jobs and invoices" />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

async function brandFor(businessKey: string): Promise<{ name: string; logo: string | null } | null> {
  const key = decodeBusinessKey(businessKey)
  if (!key) return null
  const [card, profile] = await Promise.all([businessCard(key), prisma.businessProfile.findUnique({ where: { businessKey }, select: { logoVersionId: true } })])
  return card ? { name: card.name, logo: logoUrl(profile?.logoVersionId) ?? card.logoUrl } : null
}

function Section({ title, empty, action, children }: { title: string; empty: string | null; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center justify-between text-micro font-semibold uppercase tracking-wide text-zinc-deep">
        {title}
        {action && (
          <Link href={action.href} className="normal-case tracking-normal text-signal hover:text-signal-hover">
            {action.label}
          </Link>
        )}
      </h2>
      {empty ? <p className="rounded-lg border border-line bg-rail p-4 text-sm text-graphite-soft">{empty}</p> : <ul className="divide-y divide-line rounded-lg border border-line bg-rail px-4">{children}</ul>}
    </section>
  )
}

function Row({ href, title, detail }: { href: string | null; title: string; detail: string }) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-medium text-graphite">{title}</span>
        <span className="block truncate text-micro text-zinc-deep">{detail}</span>
      </span>
      {href && <span aria-hidden="true" className="text-zinc-deep">→</span>}
    </>
  )
  return <li>{href ? <Link href={href} className="flex items-center justify-between gap-3 py-3 hover:text-signal">{body}</Link> : <div className="flex items-center justify-between gap-3 py-3">{body}</div>}</li>
}
