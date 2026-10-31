'use client'

import { useActionState, useState } from 'react'
import { reportReviewAction, type ReportState } from '../actions'
import { Select, Textarea } from '@/components/ui/Field'

const initialState: ReportState = {}

export function ReviewReportButton({ reviewId }: { reviewId: string }) {
  const [state, formAction, isPending] = useActionState(reportReviewAction, initialState)
  const [open, setOpen] = useState(false)
  if (state.ok) return <p className="mt-2 text-micro text-zinc-deep">Reported. A Doorlink admin will look at it.</p>
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-micro text-zinc-deep hover:text-graphite hover:underline">
        Report this review
      </button>
    )
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 rounded-md border border-line p-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      <Select name="reason" defaultValue="" required aria-label="Reason">
        <option value="" disabled>
          Why are you reporting it?
        </option>
        <option value="fake">Looks fake</option>
        <option value="not-a-customer">Not a real customer</option>
        <option value="abusive">Abusive or offensive</option>
        <option value="private-information">Shares private information</option>
        <option value="other">Something else</option>
      </Select>
      <Textarea name="detail" maxLength={1000} className="min-h-16" aria-label="Details" placeholder="Details (optional)" />
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex gap-3 text-sm">
        <button type="submit" disabled={isPending} className="font-medium text-signal hover:text-signal-hover">
          {isPending ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-deep">
          Cancel
        </button>
      </div>
    </form>
  )
}
