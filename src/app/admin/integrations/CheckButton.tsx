'use client'

import { useActionState } from 'react'
import { checkProviderAction, type CheckState } from './actions'

export function CheckButton({ provider }: { provider: string }) {
  const [state, action, pending] = useActionState(checkProviderAction, null as CheckState)
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-graphite hover:bg-rail disabled:opacity-60"
      >
        {pending ? 'Checking…' : 'Check connection'}
      </button>
      {state && !pending && (
        <p role="status" className={`text-sm ${state.ok ? 'text-good' : 'text-bad'}`}>
          {state.ok ? '✓ ' : '✕ '}
          {state.message}
        </p>
      )}
    </form>
  )
}
