'use client'

import { useActionState, useState } from 'react'
import { AU_STATES } from '@/lib/australia'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import { requestMeasureAction, type MeasureState } from './actions'

const initialState: MeasureState = {}

const TIMES = [
  { id: 'weekday-am', label: 'Weekday mornings' },
  { id: 'weekday-pm', label: 'Weekday afternoons' },
  { id: 'saturday', label: 'Saturday' },
  { id: 'flexible', label: 'I’m flexible' },
]

export interface MeasureCompany {
  key: string
  name: string
  verified: boolean
  rating: string | null
}

export function MeasureForm({
  spec,
  defaults,
  companies,
  preselected,
  idempotencyKey: initialKey,
}: {
  /** Made on the server so the page hydrates cleanly. */
  idempotencyKey: string
  spec: string
  defaults: { name: string; email: string; phone: string; suburb: string; state: string; postcode: string }
  companies: MeasureCompany[]
  preselected: string | null
}) {
  const [state, formAction, pending] = useActionState(requestMeasureAction, initialState)
  // Made once per form, so a double tap or a retry is the same request.
  const [idempotencyKey] = useState(initialKey)
  const [chosen, setChosen] = useState<string[]>(() =>
    preselected && companies.some((c) => c.key === preselected) ? [preselected] : companies.slice(0, 5).map((c) => c.key)
  )
  const toggle = (key: string) => setChosen((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key].slice(0, 5)))

  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-5">
      <input type="hidden" name="spec" value={spec} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {chosen.map((key) => (
        <input key={key} type="hidden" name="business" value={key} />
      ))}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-semibold text-graphite">Where is it going?</legend>
        <Field label="Street address" htmlFor="addressLine">
          <Input id="addressLine" name="addressLine" required autoComplete="address-line1" placeholder="12 Example Street" />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem] gap-2">
          <Field label="Suburb" htmlFor="suburb">
            <Input id="suburb" name="suburb" required autoComplete="address-level2" defaultValue={defaults.suburb} />
          </Field>
          <Field label="State" htmlFor="state">
            <Select id="state" name="state" required defaultValue={defaults.state}>
              <option value="">–</option>
              {AU_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Postcode" htmlFor="postcode">
            <Input id="postcode" name="postcode" required inputMode="numeric" maxLength={4} autoComplete="postal-code" defaultValue={defaults.postcode} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-semibold text-graphite">How do they reach you?</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="contactName">
            <Input id="contactName" name="contactName" required autoComplete="name" defaultValue={defaults.name} />
          </Field>
          <Field label="Mobile" htmlFor="contactPhone">
            <Input id="contactPhone" name="contactPhone" type="tel" required autoComplete="tel" placeholder="0412 345 678" defaultValue={defaults.phone} />
          </Field>
        </div>
        <Field label="Email" htmlFor="contactEmail">
          <Input id="contactEmail" name="contactEmail" type="email" required autoComplete="email" defaultValue={defaults.email} />
        </Field>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-graphite">When suits you?</legend>
        <div className="flex flex-wrap gap-2">
          {TIMES.map((time) => (
            <label
              key={time.id}
              className="cursor-pointer rounded-full border border-line bg-paper px-3.5 py-2 text-sm text-graphite has-[:checked]:border-signal has-[:checked]:bg-signal has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal"
            >
              <input type="checkbox" name="preferredTimes" value={time.id} defaultChecked={time.id === 'flexible'} className="sr-only" />
              {time.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Anything they should know? (optional)" htmlFor="notes" hint="Access, an existing door to remove, a deadline.">
        <Textarea id="notes" name="notes" maxLength={1000} className="min-h-20" />
      </Field>

      {companies.length > 0 ? (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-graphite">Who should we ask?</legend>
          <p className="mb-2 text-micro text-zinc-deep">Up to five. The first to accept gets in touch; the others are told it’s taken.</p>
          <ul className="flex flex-col gap-2">
            {companies.map((company) => {
              const selected = chosen.includes(company.key)
              return (
                <li key={company.key}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(company.key)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition-colors',
                      selected ? 'border-signal bg-signal-tint' : 'border-line bg-paper hover:border-zinc'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-graphite">{company.name}</span>
                      <span className="block text-micro text-zinc-deep">
                        {[company.verified ? 'Licence and insurance checked' : null, company.rating].filter(Boolean).join(' · ') || 'New on Doorlink'}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-micro font-bold',
                        selected ? 'border-signal bg-signal text-paper' : 'border-line bg-paper text-transparent'
                      )}
                    >
                      ✓
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ) : (
        <p className="rounded-lg border border-dashed border-line bg-rail px-4 py-3 text-sm text-graphite-soft">
          <span className="font-medium text-graphite">No local companies available yet.</span> Send your request anyway and we’ll keep it for the
          first company that registers to cover your area.
        </p>
      )}

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="h-12" disabled={pending || (companies.length > 0 && chosen.length === 0)}>
        {pending ? 'Sending…' : 'Send measure request'}
      </Button>
      <p className="-mt-2 text-center text-micro text-zinc-deep">Free. No obligation. Your design goes with it.</p>
    </form>
  )
}
