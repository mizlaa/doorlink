'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { compareQuotesAction, type CompareState } from './actions'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'

const initialState: CompareState = {}

const chip =
  'cursor-pointer rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm text-graphite has-[:checked]:border-signal has-[:checked]:bg-signal has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal'

export function CompareForm({
  spec,
  brands,
  accessories,
  mode,
  signInHref,
  defaults,
}: {
  spec: string
  brands: string[]
  accessories: Array<{ id: string; label: string }>
  /** 'customer' can compare; 'signed-out' is sent to sign in; 'business' is told quotes are for customers. */
  mode: 'customer' | 'signed-out' | 'business'
  signInHref: string
  defaults: { postcode: string; suburb: string }
}) {
  const [state, formAction, isPending] = useActionState(compareQuotesAction, initialState)

  if (mode === 'business') {
    return (
      <p className="rounded-lg border border-line bg-rail p-4 text-sm text-graphite-soft">
        Quote comparison is for customer accounts, so businesses can’t see each other’s prices. Your own prices are
        in{' '}
        <Link href="/pricing" className="font-medium text-signal hover:text-signal-hover">
          your business dashboard
        </Link>
        .
      </p>
    )
  }

  return (
    <form
      action={formAction}
      onSubmit={keepValuesOnSubmit(formAction)}
      className="flex flex-col gap-5 rounded-lg border border-line bg-paper p-5 shadow-panel"
    >
      <input type="hidden" name="spec" value={spec} />
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label="Postcode" htmlFor="postcode">
          <Input
            id="postcode"
            name="postcode"
            inputMode="numeric"
            maxLength={4}
            required
            autoComplete="postal-code"
            defaultValue={defaults.postcode}
          />
        </Field>
        <Field label="Suburb (optional)" htmlFor="suburb">
          <Input id="suburb" name="suburb" maxLength={60} autoComplete="address-level2" defaultValue={defaults.suburb} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-graphite">Installation</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'install', label: 'Supply and install' },
              { id: 'supply', label: 'Supply only' },
            ].map((option) => (
              <label key={option.id} className={chip}>
                <input type="radio" name="install" value={option.id} defaultChecked={option.id === 'install'} className="sr-only" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Brand" htmlFor="brand">
          <Select id="brand" name="brand" defaultValue="">
            <option value="">No preference</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {accessories.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-graphite">Optional accessories</legend>
          <div className="flex flex-wrap gap-2">
            {accessories.map((accessory) => (
              <label key={accessory.id} className={chip}>
                <input type="checkbox" name="accessories" value={accessory.id} className="sr-only" />
                {accessory.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      {mode === 'customer' ? (
        <Button type="submit" disabled={isPending} className="h-12 text-base">
          {isPending ? 'Finding quotes…' : 'Compare free quotes'}
        </Button>
      ) : (
        <Link
          href={signInHref}
          className="inline-flex h-12 items-center justify-center rounded-md bg-signal px-5 text-base font-semibold text-paper hover:bg-signal-hover"
        >
          Sign in to compare free quotes
        </Link>
      )}
      <p className="text-center text-micro text-zinc-deep">
        Free. Prices come straight from each business. You choose who to book, if anyone.
      </p>
    </form>
  )
}
