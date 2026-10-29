'use client'

import { useActionState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import Link from 'next/link'
import { saveBusinessDetailsAction, type BusinessDetailsState } from './actions'
import type { BusinessDetails } from '@/lib/pricing/business'
import { AU_STATES } from '@/lib/australia'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'

const initialState: BusinessDetailsState = {}

export function BusinessDetailsForm({ initial }: { initial: BusinessDetails }) {
  const [state, formAction, isPending] = useActionState(saveBusinessDetailsAction, initialState)
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-4">
      <Field
        label="Business name"
        htmlFor="businessName"
        hint="Shown to customers choosing who to get a quote from."
      >
        <Input id="businessName" name="businessName" required defaultValue={initial.businessName} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business phone" htmlFor="businessPhone" hint="Given to a customer once they book.">
          <Input id="businessPhone" name="businessPhone" type="tel" required defaultValue={initial.phone} />
        </Field>
        <Field label="ABN (optional)" htmlFor="abn">
          <Input id="abn" name="abn" inputMode="numeric" defaultValue={initial.abn} />
        </Field>
      </div>
      <Field label="Email for quote alerts" htmlFor="businessEmail">
        <Input id="businessEmail" name="businessEmail" type="email" required defaultValue={initial.email} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem_5.5rem] gap-2">
        <Field label="Suburb" htmlFor="suburb">
          <Input id="suburb" name="suburb" defaultValue={initial.suburb} />
        </Field>
        <Field label="State" htmlFor="state">
          <Select id="state" name="state" defaultValue={initial.state}>
            <option value="">–</option>
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
            inputMode="numeric"
            maxLength={4}
            defaultValue={initial.postcode}
          />
        </Field>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save details'}
        </Button>
        <Link href="/pricing" className="text-sm font-medium text-signal hover:text-signal-hover">
          Cancel
        </Link>
      </div>
    </form>
  )
}
