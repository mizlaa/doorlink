'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { adminResetMfaAction, type MfaState } from '@/lib/mfa/actions'

/** For someone locked out with no phone and no recovery codes, after checking it's them. Recorded. */
export function ResetMfaForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(adminResetMfaAction, {} as MfaState)
  if (state.message) return <span className="text-micro text-good">{state.message}</span>
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-micro font-medium text-signal hover:text-signal-hover">
        Reset two-step
      </button>
    )
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Input name="reason" required minLength={10} maxLength={300} placeholder="How you confirmed it’s them" aria-label="How you confirmed it’s them" className="h-9 min-w-0 flex-1" />
      <Button type="submit" size="sm" disabled={pending} className="bg-bad hover:bg-bad/90">
        Reset
      </Button>
      {state.error && <span role="alert" className="text-micro text-bad">{state.error}</span>}
    </form>
  )
}
