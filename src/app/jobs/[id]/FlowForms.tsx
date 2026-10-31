'use client'

import { useActionState, useState } from 'react'
import {
  acceptAndPayAction,
  confirmBookingAction,
  declineBookingAction,
  payBalanceAction,
  postJobUpdateAction,
  type FlowState,
} from './flow-actions'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'

const initialState: FlowState = {}

function ErrorNote({ state }: { state: FlowState }) {
  return state.error ? (
    <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
      {state.error}
    </p>
  ) : null
}

export function ConfirmBookingForm({
  jobId,
  estimate,
  quotedPrice,
}: {
  jobId: string
  estimate: boolean
  quotedPrice: string
}) {
  const [state, formAction, isPending] = useActionState(confirmBookingAction, initialState)
  const [declineState, declineAction, declining] = useActionState(declineBookingAction, initialState)
  const [showDecline, setShowDecline] = useState(false)

  if (showDecline)
    return (
      <form action={declineAction} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />
        <Field label="Why can’t you take it?" htmlFor="reason" hint="The customer sees this and can choose another business.">
          <Textarea id="reason" name="reason" maxLength={500} required className="min-h-20" />
        </Field>
        <ErrorNote state={declineState} />
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" disabled={declining}>
            {declining ? 'Declining…' : 'Decline booking'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowDecline(false)}>
            Back
          </Button>
        </div>
      </form>
    )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {estimate ? (
        <Field
          label="Final price, including GST ($)"
          htmlFor="finalPrice"
          hint={`Your estimate was ${quotedPrice}. Confirm it, or set the price after inspecting the site.`}
        >
          <Input id="finalPrice" name="finalPrice" inputMode="decimal" required defaultValue={quotedPrice.replace(/[$,]/g, '')} />
        </Field>
      ) : (
        <p className="text-sm text-graphite">
          Fixed price: <span className="font-semibold">{quotedPrice}</span> inc GST.
        </p>
      )}
      <Field label="Note to the customer (optional)" htmlFor="note" hint="Availability, what you’ll need on the day, anything to prepare.">
        <Textarea id="note" name="note" maxLength={1000} className="min-h-20" />
      </Field>
      <ErrorNote state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Confirming…' : 'Confirm booking'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setShowDecline(true)}>
          Decline
        </Button>
      </div>
    </form>
  )
}

export function AcceptAndPayForm({
  jobId,
  online,
  dueNow,
  dueLater,
}: {
  jobId: string
  online: boolean
  dueNow: string
  dueLater: string | null
}) {
  const [state, formAction, isPending] = useActionState(acceptAndPayAction, initialState)
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="flex items-start gap-2 text-sm text-graphite">
        <input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 accent-signal" />
        <span>
          I accept the final price and terms above.
          {online
            ? dueLater
              ? ` I pay a ${dueNow} deposit now and the ${dueLater} balance when the work is finished.`
              : ` I pay ${dueNow} now.`
            : ' I’ll pay the business directly, as agreed with them.'}
        </span>
      </label>
      <ErrorNote state={state} />
      <Button type="submit" disabled={isPending} className="h-12 text-base">
        {isPending ? 'Working…' : online ? `Pay ${dueNow} securely` : 'Accept price and terms'}
      </Button>
      {online && (
        <p className="text-center text-micro text-zinc-deep">
          Card payment by Stripe, paid to the business. Doorlink adds no fees to your price.
        </p>
      )}
    </form>
  )
}

export function PayBalanceForm({ jobId, amount }: { jobId: string; amount: string }) {
  const [state, formAction, isPending] = useActionState(payBalanceAction, initialState)
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <ErrorNote state={state} />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Working…' : `Pay the ${amount} balance`}
      </Button>
    </form>
  )
}

export function JobUpdateForm({ jobId, uploads }: { jobId: string; uploads: boolean }) {
  const [state, formAction, isPending] = useActionState(postJobUpdateAction, initialState)
  return (
    <form action={formAction} className="flex flex-col gap-3" key={state.ok ? Date.now() : 'form'}>
      <input type="hidden" name="jobId" value={jobId} />
      <Textarea name="note" maxLength={1000} className="min-h-20" placeholder="What’s happened, what’s next…" aria-label="Update" />
      {uploads && (
        <Input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Photos (up to 4)" />
      )}
      <ErrorNote state={state} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Posting…' : 'Post update'}
        </Button>
      </div>
    </form>
  )
}
