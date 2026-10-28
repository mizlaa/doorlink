'use client'

import { useActionState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { signInAction } from '@/lib/auth-session'
import type { SignInState } from '@/lib/auth-state'
import { Field, Input } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

const DEMO_ACCOUNTS = [
  { email: 'customer@demo.doorlink', label: 'Customer' },
  { email: 'technician@demo.doorlink', label: 'Technician' },
  { email: 'supplier@demo.doorlink', label: 'Supplier' },
  { email: 'manufacturer@demo.doorlink', label: 'Manufacturer' },
  { email: 'admin@demo.doorlink', label: 'Admin' },
]

const initialState: SignInState = {}

export function SignInForm({ mode, next }: { mode: 'dev' | 'supabase'; next?: string }) {
  const [state, formAction, isPending] = useActionState(signInAction, initialState)

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Email" htmlFor="email" error={state.error}>
          <Input id="email" name="email" type="email" required placeholder="you@example.com" />
        </Field>
        {mode === 'supabase' && (
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </Field>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Signing in…' : mode === 'supabase' ? 'Sign in' : 'Continue'}
        </Button>
      </form>

      {mode === 'dev' && (
        <div className="border-t border-line pt-6">
          <p className="mb-3 text-sm font-medium text-graphite">Quick sign-in as a demo account</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <form key={account.email} action={formAction} onSubmit={keepValuesOnSubmit(formAction)}>
                <input type="hidden" name="email" value={account.email} />
                {next && <input type="hidden" name="next" value={next} />}
                <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
                  {account.label}
                </Button>
              </form>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
