'use client'

import { useActionState, useState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import {
  addPortfolioAction,
  saveAccessoriesAction,
  saveCoverageAction,
  saveProfileAction,
  type ProfileFormState,
} from './actions'
import { DEPOSIT_CHOICES } from '@/lib/business/deposit'
import { ACCESSORIES } from '@/lib/pricing/accessories'
import { PRICED_PRODUCTS } from '@/lib/pricing/products'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'

const initialState: ProfileFormState = {}

function Status({ state, saved = 'Saved.' }: { state: ProfileFormState; saved?: string }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
        {state.error}
      </p>
    )
  if (state.ok) return <p className="text-sm text-good">{saved}</p>
  return null
}

const chip =
  'cursor-pointer rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm text-graphite has-[:checked]:border-signal has-[:checked]:bg-signal has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal'

export function ProfileForm({
  initial,
  logoUrl,
}: {
  initial: {
    description: string
    warranty: string
    leadTimeDays: string
    depositPercent: number
    products: string[]
  }
  logoUrl: string | null
}) {
  const [state, formAction, isPending] = useActionState(saveProfileAction, initialState)
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-rail">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Your logo" className="size-full object-contain" />
          ) : (
            <span className="text-micro text-zinc-deep">Logo</span>
          )}
        </div>
        <Field label="Logo" htmlFor="logo" hint="JPEG, PNG or WebP, under 8 MB.">
          <Input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" />
        </Field>
      </div>
      <Field label="About your business" htmlFor="description" hint="What you do, how long you’ve done it, what you’re good at.">
        <Textarea id="description" name="description" maxLength={1500} defaultValue={initial.description} className="min-h-28" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-graphite">Products you supply and install</legend>
        <div className="flex flex-wrap gap-2">
          {PRICED_PRODUCTS.map((product) => (
            <label key={product.id} className={chip}>
              <input
                type="checkbox"
                name="products"
                value={product.id}
                defaultChecked={initial.products.includes(product.id)}
                className="sr-only"
              />
              {product.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Warranty" htmlFor="warranty" hint="For example: 5 years on the door, 2 years on the motor.">
          <Input id="warranty" name="warranty" maxLength={300} defaultValue={initial.warranty} />
        </Field>
        <Field label="Typical lead time (days)" htmlFor="leadTimeDays" hint="From booking to installation.">
          <Input id="leadTimeDays" name="leadTimeDays" inputMode="numeric" defaultValue={initial.leadTimeDays} />
        </Field>
      </div>
      <Field
        label="Payment when a job is confirmed"
        htmlFor="depositPercent"
        hint="With a deposit, the customer pays the balance through Doorlink when you finish."
      >
        <Select id="depositPercent" name="depositPercent" defaultValue={String(initial.depositPercent)}>
          {DEPOSIT_CHOICES.map((percent) => (
            <option key={percent} value={percent}>
              {percent === 100 ? 'Full payment up front' : `${percent}% deposit`}
            </option>
          ))}
        </Select>
      </Field>
      <Status state={state} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  )
}

export function CoverageForm({ initial }: { initial: Array<{ text: string; fee: string }> }) {
  const [state, formAction, isPending] = useActionState(saveCoverageAction, initialState)
  const [rows, setRows] = useState(initial.length > 0 ? initial : [{ text: '', fee: '' }])
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-3">
      <p className="text-sm text-graphite-soft">
        Postcodes and ranges, like <span className="font-code">2000-2234, 2750</span>. Add a row with a travel fee for
        areas further out.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
          <Input
            name={`area_${i}`}
            aria-label={`Postcodes, row ${i + 1}`}
            placeholder="2000-2234, 2750"
            defaultValue={row.text}
          />
          <Input name={`fee_${i}`} aria-label={`Travel fee, row ${i + 1}`} placeholder="Travel $0" defaultValue={row.fee} inputMode="decimal" />
        </div>
      ))}
      {rows.length < 20 && (
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { text: '', fee: '' }])}
          className="self-start text-sm font-medium text-signal hover:text-signal-hover"
        >
          + Add a row
        </button>
      )}
      <Status state={state} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save service area'}
        </Button>
      </div>
    </form>
  )
}

export function AccessoriesForm({ initial }: { initial: Record<string, { price: string; gst: string }> }) {
  const [state, formAction, isPending] = useActionState(saveAccessoriesAction, initialState)
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-3">
      <p className="text-sm text-graphite-soft">Leave a price blank if you don’t supply it. Customers see “not priced” instead.</p>
      {ACCESSORIES.map((accessory) => (
        <div key={accessory.id} className="grid grid-cols-[1fr_7rem_8rem] items-center gap-2">
          <label htmlFor={`price_${accessory.id}`} className="text-sm text-graphite">
            {accessory.label}
          </label>
          <Input
            id={`price_${accessory.id}`}
            name={`price_${accessory.id}`}
            inputMode="decimal"
            placeholder="$"
            defaultValue={initial[accessory.id]?.price ?? ''}
          />
          <Select name={`gst_${accessory.id}`} aria-label={`${accessory.label} GST`} defaultValue={initial[accessory.id]?.gst ?? 'INCLUSIVE'}>
            <option value="INCLUSIVE">inc GST</option>
            <option value="EXCLUSIVE">+ GST</option>
          </Select>
        </div>
      ))}
      <Status state={state} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save accessories'}
        </Button>
      </div>
    </form>
  )
}

export function PortfolioForm() {
  const [state, formAction, isPending] = useActionState(addPortfolioAction, initialState)
  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Photo" htmlFor="image">
        <Input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required />
      </Field>
      <Field label="Caption (optional)" htmlFor="caption">
        <Input id="caption" name="caption" maxLength={200} />
      </Field>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Uploading…' : 'Add photo'}
      </Button>
      <Status state={state} saved="Added." />
    </form>
  )
}
