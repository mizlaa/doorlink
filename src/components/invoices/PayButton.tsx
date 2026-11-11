'use client'

import { useActionState } from 'react'
import type { PayState } from '@/lib/invoices/pay-actions'

/** One obvious button. The amount is worked out again on the server. */
export function PayButton({ action, fields, label }: { action: (prev: PayState, form: FormData) => Promise<PayState>; fields: Record<string, string>; label: string }) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center rounded bg-signal px-5 text-sm font-semibold text-paper hover:bg-signal-hover disabled:opacity-60">
        {pending ? 'Opening secure payment…' : label}
      </button>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  )
}
