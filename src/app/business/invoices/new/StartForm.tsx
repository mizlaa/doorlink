'use client'

import { useActionState, useState } from 'react'
import { AU_STATES } from '@/lib/australia'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import { startInvoiceAction, type InvoiceState } from '../actions'

const initial: InvoiceState = {}

export interface SourceOption {
  value: string
  title: string
  detail: string
  amount: string | null
}

export function StartForm({ jobs, customers, preselected }: { jobs: SourceOption[]; customers: SourceOption[]; preselected: string | null }) {
  const [state, formAction, pending] = useActionState(startInvoiceAction, initial)
  const [source, setSource] = useState(preselected ?? (jobs[0]?.value ?? ''))
  const [query, setQuery] = useState('')
  const shownCustomers = customers.filter((c) => `${c.title} ${c.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12)

  const option = (o: SourceOption) => (
    <li key={o.value}>
      <label
        className={cn(
          'flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal',
          source === o.value ? 'border-signal bg-signal-tint' : 'border-line bg-paper hover:border-zinc'
        )}
      >
        <input type="radio" name="source" value={o.value} checked={source === o.value} onChange={() => setSource(o.value)} className="sr-only" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-graphite">{o.title}</span>
          <span className="block truncate text-micro text-zinc-deep">{o.detail}</span>
        </span>
        {o.amount && <span className="shrink-0 font-semibold tabular-nums text-graphite">{o.amount}</span>}
      </label>
    </li>
  )

  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-6">
      {jobs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-graphite">A job</h2>
          <p className="mb-2 text-micro text-zinc-deep">The customer, the site and the agreed items come across with it.</p>
          <ul className="flex flex-col gap-2">{jobs.map(option)}</ul>
        </section>
      )}

      {customers.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-graphite">An existing customer</h2>
          {customers.length > 6 && (
            <Input aria-label="Find a customer" placeholder="Find a customer" value={query} onChange={(event) => setQuery(event.target.value)} className="mb-2" />
          )}
          <ul className="flex flex-col gap-2">{shownCustomers.map(option)}</ul>
        </section>
      )}

      <section>
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal',
            source === 'new' ? 'border-signal bg-signal-tint' : 'border-line bg-paper hover:border-zinc'
          )}
        >
          <input type="radio" name="source" value="new" checked={source === 'new'} onChange={() => setSource('new')} className="sr-only" />
          <span>
            <span className="block font-medium text-graphite">A new or walk-in customer</span>
            <span className="block text-micro text-zinc-deep">Type their details once; they’re saved for next time.</span>
          </span>
        </label>
        {source === 'new' && (
          <div className="mt-3 flex flex-col gap-4 rounded-lg border border-line bg-rail p-4">
            <Field label="Customer name" htmlFor="name">
              <Input id="name" name="name" required autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email (optional)" htmlFor="email">
                <Input id="email" name="email" type="email" autoComplete="off" />
              </Field>
              <Field label="Phone (optional)" htmlFor="phone">
                <Input id="phone" name="phone" type="tel" autoComplete="off" />
              </Field>
            </div>
            <Field label="Site address (optional)" htmlFor="addressLine">
              <Input id="addressLine" name="addressLine" autoComplete="off" placeholder="12 Example Street" />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem] gap-2">
              <Field label="Suburb" htmlFor="suburb">
                <Input id="suburb" name="suburb" autoComplete="off" />
              </Field>
              <Field label="State" htmlFor="state">
                <Select id="state" name="state" defaultValue="">
                  <option value="">–</option>
                  {AU_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Postcode" htmlFor="postcode">
                <Input id="postcode" name="postcode" inputMode="numeric" maxLength={4} autoComplete="off" />
              </Field>
            </div>
          </div>
        )}
      </section>

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12" disabled={pending || !source}>
        {pending ? 'Starting…' : 'Next: items and price'}
      </Button>
    </form>
  )
}
