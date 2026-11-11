import type { Metadata } from 'next'
import Link from 'next/link'
import { businessPage } from '@/lib/business/guard'
import { formatQuantity } from '@/lib/invoices/money'
import { formatMoney } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { formatInZone } from '@/lib/timezone'
import { Card, Empty, PageHeader, Pill, SectionTitle } from '@/components/business/ui'
import { cn } from '@/lib/utils'
import { AddItemForm, AdjustForm } from './StockForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Stock' }

const REASONS: Record<string, string> = { RECEIVED: 'Received', USED: 'Used', COUNT: 'Counted', INVOICE: 'Invoiced' }

/**
 * Parts and doors on the shelf. Stock goes down by itself when an invoice
 * line linked to an item is issued, and an alert goes to the business when
 * an item reaches its reorder level.
 */
export default async function StockPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const gate = await businessPage('MANAGER', '/business/stock')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const lowOnly = (await searchParams).show === 'low'
  const items = await prisma.stockItem.findMany({
    where: { businessId: business.businessId, archivedAt: null },
    orderBy: { name: 'asc' },
    include: { movements: { orderBy: { createdAt: 'desc' }, take: 3 } },
  })
  const low = items.filter((i) => i.reorderX100 > 0 && i.onHandX100 <= i.reorderX100)
  const shown = lowOnly ? low : items
  return (
    <>
      <PageHeader title="Stock" subtitle={low.length ? `${low.length} item${low.length === 1 ? '' : 's'} at or below the reorder level.` : 'Everything is above its reorder level.'} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <nav className="mb-3 flex gap-1.5" aria-label="Show">
            {[
              ['All', '/business/stock', !lowOnly],
              [`Low (${low.length})`, '/business/stock?show=low', lowOnly],
            ].map(([label, href, active]) => (
              <Link key={String(href)} href={String(href)} className={cn('rounded-full border px-3 py-1.5 text-sm font-medium', active ? 'border-graphite bg-graphite text-paper' : 'border-line bg-rail text-graphite-soft')}>
                {label}
              </Link>
            ))}
          </nav>
          {shown.length === 0 ? (
            <Empty title={lowOnly ? 'Nothing is low' : 'No stock yet'}>{lowOnly ? '' : 'Add the parts and doors you keep on hand. Link them on invoices and stock comes off by itself.'}</Empty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-rail">
              {shown.map((item) => {
                const isLow = item.reorderX100 > 0 && item.onHandX100 <= item.reorderX100
                return (
                  <li key={item.id} className="flex flex-col gap-2 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-medium text-graphite">{item.name}</span>
                        <span className="block text-micro text-zinc-deep">
                          {[item.sku, item.sellPriceCents !== null ? formatMoney(item.sellPriceCents) : null, item.reorderX100 > 0 ? `reorder at ${formatQuantity(item.reorderX100)}` : 'no reorder level'].filter(Boolean).join(' · ')}
                        </span>
                        {item.movements.length > 0 && (
                          <span className="block text-micro text-zinc-deep">
                            {item.movements
                              .map((m) => `${REASONS[m.reason] ?? m.reason} ${m.deltaX100 > 0 ? '+' : ''}${formatQuantity(m.deltaX100)} (${formatInZone(m.createdAt, business.timezone, { day: 'numeric', month: 'short' })})`)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-semibold tabular-nums text-graphite">
                          {formatQuantity(item.onHandX100)} {item.unit}
                        </span>
                        {isLow && <Pill tone="amber">Low</Pill>}
                      </span>
                    </div>
                    <AdjustForm id={item.id} unit={item.unit} reorder={(item.reorderX100 / 100).toString()} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <Card>
          <SectionTitle>Add an item</SectionTitle>
          <AddItemForm />
        </Card>
      </div>
    </>
  )
}
