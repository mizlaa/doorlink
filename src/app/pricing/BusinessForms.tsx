'use client'

import { useActionState } from 'react'
import { createBusinessAction, saveProfileAction, type FormState } from './actions'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export function CreateBusinessForm({ suggestedName }: { suggestedName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createBusinessAction, {})
  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <Field label="Business name" htmlFor="name" error={state.error} hint="Customers see this name next to your quotes.">
        <Input id="name" name="name" defaultValue={suggestedName} maxLength={120} required />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? 'Setting up…' : 'Set up my business'}</Button>
    </form>
  )
}

export interface ProfileValues {
  about: string
  serviceArea: string
  phone: string
  website: string
  abn: string
  quotingEnabled: boolean
}

export function ProfileForm({ initial, hasActiveRules }: { initial: ProfileValues; hasActiveRules: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, {})
  const e = state.errors ?? {}
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      <label className="flex items-start gap-3 rounded-md border border-line bg-rail p-4">
        <input type="checkbox" name="quotingEnabled" defaultChecked={initial.quotingEnabled} className="mt-1 h-4 w-4 accent-signal" />
        <span>
          <span className="block text-sm font-medium text-graphite">Give customers automated quotes</span>
          <span className="mt-1 block text-micro text-zinc-deep">
            When this is on, customers can pick your business and get an instant quote from your active prices. Sizes or options you have not priced are never quoted.
            {!hasActiveRules && ' Add at least one price first, or customers will not see you.'}
          </span>
        </span>
      </label>
      <Field label="About your business" htmlFor="about" error={e.about} hint="Shown on your company profile.">
        <Textarea id="about" name="about" defaultValue={initial.about} maxLength={2000} rows={3} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service area" htmlFor="serviceArea" error={e.serviceArea}>
          <Input id="serviceArea" name="serviceArea" defaultValue={initial.serviceArea} maxLength={200} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={e.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={initial.phone} maxLength={30} />
        </Field>
        <Field label="Website" htmlFor="website" error={e.website}>
          <Input id="website" name="website" defaultValue={initial.website} maxLength={200} />
        </Field>
        <Field label="ABN" htmlFor="abn" error={e.abn}>
          <Input id="abn" name="abn" inputMode="numeric" defaultValue={initial.abn} maxLength={20} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save profile'}</Button>
        {state.saved && <p className="text-sm text-good">Saved.</p>}
      </div>
    </form>
  )
}
