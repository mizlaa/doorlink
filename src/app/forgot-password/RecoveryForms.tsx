'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { requestPasswordResetAction, setNewPasswordAction } from '@/lib/recovery-actions'

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, {})
  if (state.sent)
    return (
      <p role="status" className="rounded border border-line bg-rail p-4 text-sm text-graphite">
        If that email has a Doorlink account, a reset link is on its way. It works once and expires within the hour. Check your junk folder too.
      </p>
    )
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        {pending ? 'Sending…' : 'Email me a reset link'}
      </Button>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  )
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(setNewPasswordAction, {})
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="New password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Type it again" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        {pending ? 'Saving…' : 'Save new password'}
      </Button>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  )
}
