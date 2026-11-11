'use client'

import { useMemo, useState } from 'react'
import { formatQuantity, invoiceTotals, LINE_KINDS, parseDollars, parseQuantity, type LineInput } from '@/lib/invoices/money'
import { cn } from '@/lib/utils'

interface Row {
  key: number
  kind: string
  description: string
  quantity: string
  price: string
  gst: boolean
  stock: string
}

export interface StockOption {
  id: string
  name: string
  unit: string
  sellPriceCents: number | null
  onHand: string
}

const dollars = (cents: number) => (cents / 100).toFixed(2)
const money = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)

/**
 * The items on a quote or an invoice. The total shown here is a running
 * preview worked with the same function the server uses; what is saved is
 * always recalculated on the server from the lines themselves.
 */
export function LineItemsEditor({
  initial,
  gstRegistered,
  initialIncludesGst = true,
  stock = [],
  paidCents = 0,
}: {
  initial: LineInput[]
  gstRegistered: boolean
  initialIncludesGst?: boolean
  stock?: StockOption[]
  /** Already paid on the job (a deposit), shown against the total. */
  paidCents?: number
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [{ kind: 'DOOR', description: '', quantityX100: 100, unitPriceCents: 0, gstApplicable: true } as LineInput]).map((line, i) => ({
      key: i,
      kind: line.kind,
      description: line.description,
      quantity: formatQuantity(line.quantityX100),
      price: line.unitPriceCents ? dollars(line.unitPriceCents) : '',
      gst: line.gstApplicable,
      stock: line.stockItemId ?? '',
    }))
  )
  const [nextKey, setNextKey] = useState(initial.length + 1)
  const [includesGst, setIncludesGst] = useState(initialIncludesGst)

  const update = (key: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const add = (kind: string) => {
    setRows((current) => [...current, { key: nextKey, kind, description: '', quantity: '1', price: '', gst: true, stock: '' }])
    setNextKey((k) => k + 1)
  }

  const totals = useMemo(
    () =>
      invoiceTotals(
        rows.map((row) => ({ quantityX100: parseQuantity(row.quantity) ?? 0, unitPriceCents: parseDollars(row.price) ?? 0, gstApplicable: row.gst })),
        { gstRegistered, pricesIncludeGst: includesGst }
      ),
    [rows, gstRegistered, includesGst]
  )

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="pricesIncludeGst" value={includesGst ? '1' : '0'} />
      {gstRegistered && (
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">Prices</legend>
          <span className="text-zinc-deep">The prices I type</span>
          {[
            { value: true, label: 'include GST' },
            { value: false, label: 'are before GST' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={includesGst === option.value}
              onClick={() => setIncludesGst(option.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 font-medium',
                includesGst === option.value ? 'border-signal bg-signal text-paper' : 'border-line bg-paper text-graphite hover:border-zinc'
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const amount = Math.round(((parseQuantity(row.quantity) ?? 0) * (parseDollars(row.price) ?? 0)) / 100)
          return (
            <li key={row.key} className="rounded-lg border border-line bg-paper p-3">
              <input type="hidden" name="line.gst" value={row.gst ? 'gst' : 'free'} />
              <input type="hidden" name="line.stock" value={row.stock} />
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_5rem_7rem_auto]">
                <label className="block">
                  <span className="sr-only">Type of item {index + 1}</span>
                  <select name="line.kind" value={row.kind} onChange={(event) => update(row.key, { kind: event.target.value })} className="field-select h-11 w-full appearance-none rounded border border-line bg-rail pl-2.5 pr-8 text-sm text-graphite">
                    {LINE_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="sr-only">Description of item {index + 1}</span>
                  <input
                    name="line.description"
                    value={row.description}
                    onChange={(event) => update(row.key, { description: event.target.value })}
                    maxLength={200}
                    placeholder="Description"
                    className="h-11 w-full rounded border border-line bg-rail px-3 text-sm text-graphite placeholder:text-zinc"
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-micro text-zinc-deep sm:sr-only">Qty</span>
                  <input name="line.quantity" value={row.quantity} onChange={(event) => update(row.key, { quantity: event.target.value })} inputMode="decimal" aria-label={`Quantity of item ${index + 1}`} className="h-11 w-full rounded border border-line bg-rail px-2.5 text-right text-sm tabular-nums text-graphite" />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-micro text-zinc-deep sm:sr-only">Unit price ($)</span>
                  <input name="line.price" value={row.price} onChange={(event) => update(row.key, { price: event.target.value })} inputMode="decimal" placeholder="0.00" aria-label={`Unit price of item ${index + 1}`} className="h-11 w-full rounded border border-line bg-rail px-2.5 text-right text-sm tabular-nums text-graphite placeholder:text-zinc" />
                </label>
                <button
                  type="button"
                  onClick={() => setRows((current) => (current.length > 1 ? current.filter((r) => r.key !== row.key) : current))}
                  disabled={rows.length === 1}
                  aria-label={`Remove item ${index + 1}`}
                  className="col-span-2 flex h-9 items-center justify-center rounded text-sm text-zinc-deep hover:bg-rail hover:text-bad disabled:opacity-30 sm:col-span-1 sm:h-11 sm:w-9"
                >
                  <span aria-hidden="true">✕</span>
                  <span className="ml-1.5 sm:sr-only">Remove</span>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {gstRegistered && (
                    <label className="flex items-center gap-1.5 text-zinc-deep">
                      <input type="checkbox" checked={row.gst} onChange={(event) => update(row.key, { gst: event.target.checked })} className="h-4 w-4 accent-[#1769D2]" />
                      GST applies
                    </label>
                  )}
                  {stock.length > 0 && (row.kind === 'PART' || row.kind === 'MOTOR' || row.kind === 'DOOR') && (
                    <label className="flex items-center gap-1.5 text-zinc-deep">
                      <span>From stock</span>
                      <select
                        value={row.stock}
                        onChange={(event) => {
                          const item = stock.find((s) => s.id === event.target.value)
                          update(row.key, {
                            stock: event.target.value,
                            ...(item && !row.description ? { description: item.name } : {}),
                            ...(item?.sellPriceCents && !row.price ? { price: dollars(item.sellPriceCents) } : {}),
                          })
                        }}
                        className="field-select h-9 max-w-[11rem] appearance-none rounded border border-line bg-rail pl-2 pr-8 text-sm text-graphite"
                      >
                        <option value="">Not tracked</option>
                        {stock.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.onHand} {item.unit})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <span className="font-semibold tabular-nums text-graphite">{money(amount)}</span>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-sm text-zinc-deep">Add</span>
        {LINE_KINDS.map((kind) => (
          <button key={kind.id} type="button" onClick={() => add(kind.id)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium text-graphite hover:border-signal">
            + {kind.label}
          </button>
        ))}
      </div>

      <dl className="ml-auto w-full max-w-xs text-sm" aria-live="polite">
        {gstRegistered && (
          <>
            <div className="flex justify-between py-0.5">
              <dt className="text-zinc-deep">Subtotal (before GST)</dt>
              <dd className="tabular-nums">{money(totals.subtotalExGstCents)}</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-zinc-deep">GST (10%)</dt>
              <dd className="tabular-nums">{money(totals.gstCents)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between border-t border-line py-1.5 text-base font-semibold text-graphite">
          <dt>{gstRegistered ? 'Total including GST' : 'Total'}</dt>
          <dd className="tabular-nums">{money(totals.totalCents)}</dd>
        </div>
        {paidCents > 0 && (
          <>
            <div className="flex justify-between py-0.5 text-zinc-deep">
              <dt>Deposit already paid</dt>
              <dd className="tabular-nums">-{money(paidCents)}</dd>
            </div>
            <div className="flex justify-between py-0.5 font-semibold text-graphite">
              <dt>Remaining balance</dt>
              <dd className="tabular-nums">{money(Math.max(0, totals.totalCents - paidCents))}</dd>
            </div>
          </>
        )}
        {!gstRegistered && <p className="mt-1 text-micro text-zinc-deep">You’re not registered for GST, so none is charged.</p>}
      </dl>
    </div>
  )
}
