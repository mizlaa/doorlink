'use client'

import { useActionState } from 'react'
import { createLeadAction, type RequestFormState } from './actions'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

interface Option {
  id: string
  label: string
  description?: string | null
}

const initialState: RequestFormState = {}

const URGENCY_OPTIONS = [
  { value: 'EMERGENCY', label: 'Emergency, today if possible' },
  { value: 'URGENT', label: 'Urgent, within a few days' },
  { value: 'STANDARD', label: 'Standard, within a couple of weeks' },
  { value: 'FLEXIBLE', label: 'Flexible, no rush' },
]

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

export function RequestForm({
  serviceCategories,
  models,
  signedIn,
  prefill,
}: {
  serviceCategories: Option[]
  models: Option[]
  signedIn: boolean
  /** Arrives when someone came here from a saved door configuration. */
  prefill?: { title: string; message: string }
}) {
  const [state, formAction, isPending] = useActionState(createLeadAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-5 rounded-lg border border-line bg-paper p-5 shadow-sm sm:p-6">
        <legend className="text-sm font-semibold uppercase tracking-[0.14em] text-graphite">
          What needs doing
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="What kind of work is it?" htmlFor="serviceCategoryId">
            <Select id="serviceCategoryId" name="serviceCategoryId" defaultValue="">
              <option value="">Not sure / not listed</option>
              {serviceCategories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Job title" htmlFor="title" hint='e.g. "Roller door won’t close"'>
            <Input id="title" name="title" required maxLength={120} defaultValue={prefill?.title ?? ''} />
          </Field>
        </div>

        <Field
          label="Describe the problem"
          htmlFor="message"
          hint="What happens, any noises, when it started."
        >
          <Textarea
            id="message"
            name="message"
            required
            rows={6}
            minLength={20}
            defaultValue={prefill?.message ?? ''}
          />
        </Field>

        <Field
          label="Which product is it?"
          htmlFor="modelId"
          hint="Optional."
        >
          <Select id="modelId" name="modelId" defaultValue="">
            <option value="">Not sure / not listed</option>
            {models.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-5 rounded-lg border border-line bg-paper p-5 shadow-sm sm:p-6">
        <legend className="text-sm font-semibold uppercase tracking-[0.14em] text-graphite">
          Where and when
        </legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Suburb" htmlFor="suburb">
            <Input id="suburb" name="suburb" autoComplete="address-level2" />
          </Field>
          <Field label="State" htmlFor="state">
            <Select id="state" name="state" defaultValue="">
              <option value="">Select state</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Postcode" htmlFor="postcode">
            <Input id="postcode" name="postcode" inputMode="numeric" maxLength={4} autoComplete="postal-code" />
          </Field>
        </div>

        <Field label="How soon do you need it?" htmlFor="urgency">
          <Select id="urgency" name="urgency" defaultValue="STANDARD">
            {URGENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Preferred times"
          htmlFor="preferredTiming"
          hint='Optional, e.g. "weekday mornings"'
        >
          <Input id="preferredTiming" name="preferredTiming" />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-5 rounded-lg border border-line bg-paper p-5 shadow-sm sm:p-6">
        <legend className="text-sm font-semibold uppercase tracking-[0.14em] text-graphite">
          Budget <span className="font-normal normal-case text-zinc-deep">(optional)</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From (AUD)" htmlFor="budgetMin">
            <Input id="budgetMin" name="budgetMin" type="number" min="0" step="1" inputMode="decimal" />
          </Field>
          <Field label="To (AUD)" htmlFor="budgetMax">
            <Input id="budgetMax" name="budgetMax" type="number" min="0" step="1" inputMode="decimal" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5 rounded-lg border border-line bg-paper p-5 shadow-sm sm:p-6">
        <legend className="text-sm font-semibold uppercase tracking-[0.14em] text-graphite">
          How to reach you
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="name">
            <Input id="name" name="name" required autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </Field>
        </div>

        <Field label="Phone" htmlFor="phone" hint="Optional. Quotes come faster with one.">
           <Input id="phone" name="phone" type="tel" autoComplete="tel" />
        </Field>

        {!signedIn && (
          <p className="rounded-md border border-line bg-rail p-3 text-sm text-graphite-soft">
            No account needed. Sign in to track your quotes.
          </p>
        )}
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-graphite bg-graphite p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? 'Posting...' : 'Post job'}
        </Button>
        <p className="text-sm text-paper/70">It is free to post. You only pay if you hire someone.</p>
      </div>
    </form>
  )
}
