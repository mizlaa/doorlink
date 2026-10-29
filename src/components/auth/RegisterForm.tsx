'use client'

import { useActionState, useState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { registerAction } from '@/lib/auth-session'
import type { RegisterState } from '@/lib/auth-state'
import { AU_STATES } from '@/lib/australia'
import { Field, Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const ROLE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Customer', hint: 'Design, get quotes, hire' },
  { value: 'TECHNICIAN', label: 'Installer', hint: 'Doors, gates, shutters' },
  { value: 'SUPPLIER', label: 'Supplier', hint: 'Supply and quote' },
  { value: 'MANUFACTURER', label: 'Manufacturer', hint: 'Catalogue owner' },
]

const initialState: RegisterState = {}

export function RegisterForm({
  mode,
  initialRole = 'CUSTOMER',
}: {
  mode: 'dev' | 'supabase'
  initialRole?: string
}) {
  const [state, formAction, isPending] = useActionState(registerAction, initialState)
  const [role, setRole] = useState(initialRole)
  const [email, setEmail] = useState('')
  // The alert email follows the login email until the person changes it.
  const [alertEmail, setAlertEmail] = useState<string | null>(null)
  const isBusiness = role === 'TECHNICIAN' || role === 'SUPPLIER'

  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-graphite">I’m a…</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'cursor-pointer rounded-lg border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal',
                role === option.value
                  ? 'border-signal bg-signal-tint'
                  : 'border-line bg-paper hover:border-zinc'
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-graphite">{option.label}</span>
              <span className="block text-micro text-zinc-deep">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" required autoComplete="name" />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      {mode === 'supabase' && (
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" required autoComplete="new-password" />
        </Field>
      )}

      {isBusiness && (
        <fieldset className="flex flex-col gap-4 rounded-lg border border-line bg-rail p-4">
          <legend className="px-1 text-sm font-semibold text-graphite">Your business</legend>
          <p className="-mt-2 text-micro text-zinc-deep">
            Customers see your business name when they choose who to get a quote from. Quote and booking alerts
            go to the email below.
          </p>
          <Field label="Business name" htmlFor="businessName">
            <Input id="businessName" name="businessName" required autoComplete="organization" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business phone" htmlFor="businessPhone">
              <Input
                id="businessPhone"
                name="businessPhone"
                type="tel"
                required
                autoComplete="tel"
                placeholder="0412 345 678"
              />
            </Field>
            <Field label="ABN (optional)" htmlFor="abn">
              <Input id="abn" name="abn" inputMode="numeric" placeholder="51 824 753 556" />
            </Field>
          </div>
          <Field label="Email for quote alerts" htmlFor="businessEmail">
            <Input
              id="businessEmail"
              name="businessEmail"
              type="email"
              required
              value={alertEmail ?? email}
              onChange={(event) => setAlertEmail(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-[1fr_6.5rem_5.5rem] gap-2">
            <Field label="Suburb" htmlFor="suburb">
              <Input id="suburb" name="suburb" autoComplete="address-level2" />
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
              <Input
                id="postcode"
                name="postcode"
                inputMode="numeric"
                maxLength={4}
                autoComplete="postal-code"
              />
            </Field>
          </div>
        </fieldset>
      )}

      {role === 'MANUFACTURER' && (
        <Field
          label="Organisation name"
          htmlFor="organizationName"
          hint="Linking it to a verified catalogue entry is done separately, by an admin."
        >
          <Input id="organizationName" name="organizationName" required />
        </Field>
      )}

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
