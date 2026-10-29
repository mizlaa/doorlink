'use client'

import { useActionState, useState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { bookQuoteAction, type BookingState } from './actions'
import { BOOKING_TIMINGS } from '@/lib/pricing/booking'
import { AU_STATES } from '@/lib/australia'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { cn } from '@/lib/utils'

const initialState: BookingState = {}

export function BookingForm({
  reference,
  businessName,
  options,
  defaults,
}: {
  reference: string
  businessName: string
  options: Array<{ id: string; label: string; total: string }>
  defaults: { name: string; phone: string }
}) {
  const [state, formAction, isPending] = useActionState(bookQuoteAction, initialState)
  const [optionId, setOptionId] = useState(options[0]?.id ?? '')
  const [timing, setTiming] = useState<string>('two-weeks')

  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-4">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="optionId" value={optionId} />
      <input type="hidden" name="timing" value={timing} />

      {options.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-graphite">Option</legend>
          <div className="flex flex-col gap-2">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setOptionId(option.id)}
                aria-pressed={optionId === option.id}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
                  optionId === option.id
                    ? 'border-signal bg-signal-tint'
                    : 'border-line bg-paper hover:border-zinc'
                )}
              >
                <span className="font-medium text-graphite">{option.label}</span>
                <span className="font-semibold text-graphite">{option.total}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" required autoComplete="name" defaultValue={defaults.name} />
        </Field>
        <Field label="Phone" htmlFor="phone" hint="Shared with the company now that you’re booking.">
          <Input id="phone" name="phone" type="tel" required autoComplete="tel" defaultValue={defaults.phone} />
        </Field>
      </div>
      <Field label="Site address" htmlFor="address">
        <Input
          id="address"
          name="address"
          required
          autoComplete="street-address"
          placeholder="12 Example Street"
        />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem_5.5rem] gap-2">
        <Field label="Suburb" htmlFor="suburb">
          <Input id="suburb" name="suburb" required autoComplete="address-level2" />
        </Field>
        <Field label="State" htmlFor="state">
          <Select id="state" name="state" required defaultValue="">
            <option value="" disabled>
              –
            </option>
            {AU_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Postcode" htmlFor="postcode">
          <Input
            id="postcode"
            name="postcode"
            required
            inputMode="numeric"
            maxLength={4}
            autoComplete="postal-code"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-graphite">When</legend>
        <div className="flex flex-wrap gap-2">
          {BOOKING_TIMINGS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTiming(t.id)}
              aria-pressed={timing === t.id}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                timing === t.id
                  ? 'border-signal bg-signal text-paper'
                  : 'border-line bg-paper text-graphite hover:border-zinc'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Notes for the company (optional)" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          maxLength={1000}
          className="min-h-20"
          placeholder="Access, parking, anything they should know."
        />
      </Field>

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="h-12 text-base">
        {isPending ? 'Booking…' : `Book with ${businessName}`}
      </Button>
      <p className="text-center text-micro text-zinc-deep">
        {businessName} confirms a date with you. Nothing is charged through Doorlink.
      </p>
    </form>
  )
}
