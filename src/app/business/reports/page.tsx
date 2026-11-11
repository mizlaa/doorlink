import type { Metadata } from 'next'
import Link from 'next/link'
import { businessPage } from '@/lib/business/guard'
import { businessReport, PERIODS } from '@/lib/business/reports'
import { formatMoney } from '@/lib/money'
import { Card, PageHeader, SectionTitle, StatTile } from '@/components/business/ui'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reports' }

const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const gate = await businessPage('MANAGER', '/business/reports')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const wanted = (await searchParams).period
  const period = PERIODS.find((p) => p.id === wanted) ?? PERIODS[1]
  const r = await businessReport(business, period.days)
  const maxMonth = Math.max(1, ...r.receivedByMonth.map((m) => m.cents))

  return (
    <>
      <PageHeader title="Reports" subtitle="From your own invoices, payments, jobs and visits. Money counts only when a payment was confirmed." />
      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Period">
        {PERIODS.map((p) => (
          <Link key={p.id} href={`/business/reports?period=${p.id}`} aria-current={p.id === period.id ? 'true' : undefined} className={cn('rounded-full border px-3 py-1.5 text-sm font-medium', p.id === period.id ? 'border-graphite bg-graphite text-paper' : 'border-line bg-rail text-graphite-soft hover:text-graphite')}>
            {p.label}
          </Link>
        ))}
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile href="/business/invoices?show=paid" value={formatMoney(r.received)} label="Received" hint={period.label.toLowerCase()} tone="good" />
        <StatTile href="/business/invoices" value={formatMoney(r.invoicedCents)} label="Invoiced" hint={`${r.invoicedCount} invoice${r.invoicedCount === 1 ? '' : 's'}${r.invoicedGstCents ? ` · GST ${formatMoney(r.invoicedGstCents)}` : ''}`} />
        <StatTile href="/business/invoices?show=owing" value={formatMoney(r.unpaidTotal)} label="Unpaid now" tone={r.unpaid.slice(1).some((b) => b.count) ? 'attention' : 'neutral'} />
        <StatTile href="/business/jobs?show=done" value={r.jobsCompleted} label="Jobs completed" hint={r.turnaroundDays !== null ? `${r.turnaroundDays.toFixed(1)} days on average from booking` : `${r.jobsCancelled} cancelled or declined`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Received by month</SectionTitle>
          {r.receivedByMonth.length === 0 ? (
            <p className="text-sm text-graphite-soft">No payments confirmed in this period.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {r.receivedByMonth.map((m) => (
                <li key={m.month} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm">
                  <span className="text-graphite-soft">{monthName(m.month)}</span>
                  <span className="h-3 rounded-full bg-line" aria-hidden="true">
                    <span className="block h-3 rounded-full bg-signal" style={{ width: `${Math.max(2, (m.cents / maxMonth) * 100)}%` }} />
                  </span>
                  <span className="text-right font-medium tabular-nums text-graphite">{formatMoney(m.cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Unpaid invoices</SectionTitle>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {r.unpaid.map((b) => (
                <tr key={b.label}>
                  <th scope="row" className="py-2 text-left font-normal text-graphite-soft">{b.label}</th>
                  <td className="py-2 text-right text-micro text-zinc-deep">{b.count}</td>
                  <td className={cn('py-2 text-right font-medium tabular-nums', b.cents && b.min > 0 ? 'text-caution' : 'text-graphite')}>{formatMoney(b.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>Technician workload</SectionTitle>
          {r.technicians.length === 0 ? (
            <p className="text-sm text-graphite-soft">No visits in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="text-left text-micro uppercase tracking-wide text-zinc-deep">
                    <th className="py-2 font-semibold">Person</th>
                    <th className="py-2 text-right font-semibold">Visits done</th>
                    <th className="py-2 text-right font-semibold">Missed</th>
                    <th className="py-2 text-right font-semibold">Booked next 2 weeks</th>
                    <th className="py-2 text-right font-semibold">Hours booked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.technicians.map((t) => (
                    <tr key={t.name}>
                      <td className={cn('py-2', t.name === 'No technician' ? 'text-caution' : 'text-graphite')}>{t.name}</td>
                      <td className="py-2 text-right tabular-nums">{t.done}</td>
                      <td className="py-2 text-right tabular-nums">{t.missed}</td>
                      <td className="py-2 text-right tabular-nums">{t.upcoming}</td>
                      <td className="py-2 text-right tabular-nums">{t.hours.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
