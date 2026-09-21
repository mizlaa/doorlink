'use client'

import { useActionState, useState } from 'react'
import { registerAction, type RegisterState } from '@/lib/auth-session'
import { Field, Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

const ROLE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'MANUFACTURER', label: 'Manufacturer' },
]

const initialState: RegisterState = {}

export function RegisterForm({ mode }: { mode: 'dev' | 'supabase' }) {
  const [state, formAction, isPending] = useActionState(registerAction, initialState)
  const [role, setRole] = useState('CUSTOMER')
  const needsOrganization = role === 'SUPPLIER' || role === 'MANUFACTURER'

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" required />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required placeholder="you@example.com" />
      </Field>

      {mode === 'supabase' && (
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" required autoComplete="new-password" />
        </Field>
      )}

      <Field label="Account type" htmlFor="role">
        <Select id="role" name="role" value={role} onChange={(event) => setRole(event.target.value)}>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {needsOrganization && (
        <Field
          label="Organization name"
          htmlFor="organizationName"
          hint={
            role === 'MANUFACTURER'
              ? 'This creates your organization account. Linking it to a verified catalogue entry is done separately, by an admin.'
              : undefined
          }
        >
          <Input id="organizationName" name="organizationName" required />
        </Field>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
