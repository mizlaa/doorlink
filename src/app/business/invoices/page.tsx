import type { Metadata } from 'next'
import Link from 'next/link'
import { businessPage } from '@/lib/business/guard'
import { balanceCents, invoiceNumberLabel, PAYMENT_STATE_LABELS, paymentState, type PaymentState } from '@/lib/invoices/money'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { formatInZone } from '@/lib/timezone'
import { Empty, PageHeader, Pill, PrimaryLink, StatTile, type PillTone } from '@/components/business/ui'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invoices' }

const TONE: Record<PaymentState, PillTone> = { DRAFT: 'neutral', VOID: 'neutral', UNPAID: 'blue', PARTLY_PAID: 'amber', PAID: 'green', OVERDUE: 'red' }
const FILTERS: Array<{ id: string; label: string; match: (state: PaymentState) => boolean }> = [
  { id: 'all', label: 'All', match: (s) => s !== 'VOID' },
  { id: 'draft', label: 'Drafts', match: (s) => s === 'DRAFT' },
  { id: 'owing', label: 'Unpaid', match: (s) => s === 'UNPAID' || s === 'PARTLY_PAID' || s === 'OVERDUE' },
  { id: 'overdue', label: 'Overdue', match: (s) => s === 'OVERDUE' },
  { id: 'paid', label: 'Paid', match: (s) => s === 'PAID' },
  { id: 'void', label: 'Void', match: (s) => s === 'VOID' },
]

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const gate = await businessPage('MANAGER', '/business/invoices')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const wanted = (await searchParams).show
  const show = FILTERS.find((f) => f.id === wanted) ?? FILTERS[0]

  const invoices = await prisma.invoice.findMany({
    where: { businessId: business.businessId },
    orderBy: [{ number: 'desc' }, { createdAt: 'desc' }],
    take: 300,
    select: { id: true, number: true, status: true, totalCents: true, paidCents: true, dueDate: true, issuedAt: true, createdAt: true, currency: true, customer: { select: { name: true } } },
  })
  const now = new Date()
  const withState = invoices.map((invoice) => ({ invoice, state: paymentState(invoice, now) }))
  const owing = withState.filter((r) => r.state === 'UNPAID' || r.state === 'PARTLY_PAID' || r.state === 'OVERDUE')
  const overdue = withState.filter((r) => r.state === 'OVERDUE')
  const sum = (rows: typeof withState) => rows.reduce((total, r) => total + balanceCents(r.invoice), 0)
  const rows = withState.filter((r) => show.match(r.state))

  return (
    <>
      <PageHeader title="Invoices" action={<PrimaryLink href="/business/invoices/new">New invoice</PrimaryLink>} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile href="/business/invoices?show=owing" value={formatMoney(sum(owing))} label="Outstanding" hint={`${owing.length} invoice${owing.length === 1 ? '' : 's'}`} />
        <StatTile href="/business/invoices?show=overdue" value={formatMoney(sum(overdue))} label="Overdue" tone={overdue.length ? 'attention' : 'neutral'} hint={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`} />
        <StatTile href="/business/invoices?show=draft" value={withState.filter((r) => r.state === 'DRAFT').length} label="Drafts to finish" />
      </div>

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Show">
        {FILTERS.map((filter) => (
          <Link
            key={filter.id}
            href={filter.id === 'all' ? '/business/invoices' : `/business/invoices?show=${filter.id}`}
            aria-current={show.id === filter.id ? 'true' : undefined}
            className={cn('rounded-full border px-3 py-1.5 text-sm font-medium', show.id === filter.id ? 'border-graphite bg-graphite text-paper' : 'border-line bg-rail text-graphite-soft hover:text-graphite')}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Empty title={invoices.length === 0 ? 'No invoices yet' : 'Nothing here'} action={invoices.length === 0 ? <PrimaryLink href="/business/invoices/new">Raise your first invoice</PrimaryLink> : undefined}>
          {invoices.length === 0 ? 'Three steps: pick a customer or job, check the items, issue it.' : 'No invoices match this filter.'}
        </Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-rail">
          {rows.map(({ invoice, state }) => (
            <li key={invoice.id}>
              <Link href={state === 'DRAFT' ? `/business/invoices/${invoice.id}/edit` : `/business/invoices/${invoice.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-paper">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-graphite">{invoice.customer.name}</span>
                  <span className="block text-micro text-zinc-deep">
                    {invoiceNumberLabel(invoice.number)}
                    {invoice.issuedAt ? ` · issued ${formatInZone(invoice.issuedAt, business.timezone, { day: 'numeric', month: 'short' })}` : ` · started ${formatInZone(invoice.createdAt, business.timezone, { day: 'numeric', month: 'short' })}`}
                    {invoice.dueDate && state !== 'PAID' && state !== 'DRAFT' && state !== 'VOID' ? ` · due ${formatInZone(invoice.dueDate, business.timezone, { day: 'numeric', month: 'short' })}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums text-graphite">{state === 'DRAFT' ? '' : formatMoney(invoice.totalCents, invoice.currency)}</span>
                    {(state === 'PARTLY_PAID' || state === 'OVERDUE') && invoice.paidCents > 0 && <span className="block text-micro text-zinc-deep">{formatMoney(balanceCents(invoice), invoice.currency)} owing</span>}
                  </span>
                  <Pill tone={TONE[state]}>{PAYMENT_STATE_LABELS[state]}</Pill>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
