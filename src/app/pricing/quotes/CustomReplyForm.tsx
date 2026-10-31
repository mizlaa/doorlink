'use client'

import { useActionState, useState } from 'react'
import { replyCustomQuoteAction, type CustomReplyState } from './actions'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'

const initialState: CustomReplyState = {}

export function CustomReplyForm({ quoteId }: { quoteId: string }) {
  const [state, formAction, isPending] = useActionState(replyCustomQuoteAction, initialState)
  const [declining, setDeclining] = useState(false)
  if (state.ok) return <p className="text-sm font-medium text-good">Sent to the customer.</p>
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="quoteId" value={quoteId} />
      {declining ? (
        <>
          <input type="hidden" name="decision" value="decline" />
          <Textarea name="reason" maxLength={300} className="min-h-16" placeholder="Reason (optional, shown to the customer)" aria-label="Reason" />
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[8rem_8rem_1fr_1fr]">
          <Input name="price" inputMode="decimal" placeholder="Price $" required aria-label="Price" />
          <Select name="gst" defaultValue="EXCLUSIVE" aria-label="GST">
            <option value="EXCLUSIVE">+ GST</option>
            <option value="INCLUSIVE">inc GST</option>
          </Select>
          <Select name="priceType" defaultValue="FIXED" aria-label="Price type">
            <option value="FIXED">Fixed price</option>
            <option value="ESTIMATE">Estimate, confirmed on inspection</option>
          </Select>
          <Select name="installation" defaultValue="INCLUDED" aria-label="Installation">
            <option value="INCLUDED">Installation included</option>
            <option value="NOT_INCLUDED">Supply only</option>
          </Select>
          <Textarea name="note" maxLength={500} className="min-h-16 sm:col-span-4" placeholder="What’s included (optional)" aria-label="Note" />
        </div>
      )}
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Sending…' : declining ? 'Decline request' : 'Send quote'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setDeclining((d) => !d)}>
          {declining ? 'Quote instead' : 'Can’t quote this'}
        </Button>
      </div>
    </form>
  )
}
