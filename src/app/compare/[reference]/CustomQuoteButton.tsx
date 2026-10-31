'use client'

import { useActionState, useState } from 'react'
import { requestCustomQuoteAction, type CustomQuoteState } from '../actions'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'

const initialState: CustomQuoteState = {}

export function CustomQuoteButton({ comparison, business }: { comparison: string; business: string }) {
  const [state, formAction, isPending] = useActionState(requestCustomQuoteAction, initialState)
  const [open, setOpen] = useState(false)
  if (state.ok) return <p className="text-sm font-medium text-good">Requested. You’ll be notified when they reply.</p>
  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Request free custom quote
      </Button>
    )
  return (
    <form action={formAction} className="flex w-full flex-col gap-2">
      <input type="hidden" name="comparison" value={comparison} />
      <input type="hidden" name="business" value={business} />
      <Textarea
        name="message"
        maxLength={1000}
        className="min-h-20"
        aria-label="Message to the business"
        placeholder="Anything they should know (optional): access, timing, the existing door…"
      />
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Sending…' : 'Send request'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
