'use client'

import { useActionState, useEffect, useState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { issueInvoiceAction, recordPaymentAction, reversePaymentAction, sendInvoiceAction, shareInvoiceAction, voidInvoiceAction, type InvoiceState } from '../actions'

const initial: InvoiceState = {}

function Result({ state }: { state: InvoiceState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
        {state.error}
      </p>
    )
  if (state.message)
    return (
      <p role="status" className="rounded-md border border-good/30 bg-good/10 px-3 py-2 text-sm text-graphite">
        {state.message}
      </p>
    )
  return null
}

export function IssueButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(issueInvoiceAction, initial)
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <Result state={state} />
      <Button type="submit" size="lg" className="h-12 px-8" disabled={pending}>
        {pending ? 'Issuing…' : 'Issue invoice'}
      </Button>
      <p className="text-micro text-zinc-deep">Issuing gives it your next invoice number and locks it. After that it can be sent, paid or voided, but not edited.</p>
    </form>
  )
}

export function DiscardDraftButton({ id }: { id: string }) {
  const [, formAction, pending] = useActionState(voidInvoiceAction, initial)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="draft" value="1" />
      <Button type="submit" variant="ghost" className="text-bad" disabled={pending}>
        Discard draft
      </Button>
    </form>
  )
}

export function SendForm({ id, defaultTo, deliverable }: { id: string; defaultTo: string; deliverable: boolean }) {
  const [state, formAction, pending] = useActionState(sendInvoiceAction, initial)
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Send to" htmlFor="to" hint={deliverable ? 'The PDF is attached, with a link to view it online.' : 'Email isn’t connected on this site yet, so a send will fail. Download the PDF or copy the link instead.'}>
        <Input id="to" name="to" type="email" required defaultValue={defaultTo} placeholder="customer@example.com" />
      </Field>
      <Result state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : state.error ? 'Try again' : 'Send by email'}
      </Button>
    </form>
  )
}

export function ShareForm({ id, active }: { id: string; active: boolean }) {
  const [state, formAction, pending] = useActionState(shareInvoiceAction, initial)
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {active ? 'Show the link' : 'Create a link'}
        </Button>
        {active && (
          <>
            <Button type="submit" name="rotate" value="1" variant="ghost" disabled={pending}>
              Replace
            </Button>
            <Button type="submit" name="revoke" value="1" variant="ghost" className="text-bad" disabled={pending}>
              Turn off
            </Button>
          </>
        )}
      </form>
      {state.link && (
        <div className="flex gap-2">
          <Input readOnly value={state.link} aria-label="Link to this invoice" onFocus={(event) => event.currentTarget.select()} className="font-code text-micro" />
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
      <Result state={state.link ? {} : state} />
      <p className="text-micro text-zinc-deep">Anyone with the link can view and download this invoice, without signing in, for 60 days. Replace it to cut off an old link.</p>
    </div>
  )
}

export function PaymentForm({ id, balance, today }: { id: string; balance: string; today: string }) {
  const [state, formAction, pending] = useActionState(recordPaymentAction, initial)
  // One key per form: tapping twice, or retrying after a timeout, records one payment.
  const [key, setKey] = useState(() => crypto.randomUUID().replace(/-/g, ''))
  // Once a payment has gone through, the next one is a different payment.
  useEffect(() => {
    if (state.ok) setKey(crypto.randomUUID().replace(/-/g, ''))
  }, [state])
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount ($)" htmlFor="amount">
          <Input id="amount" name="amount" inputMode="decimal" required defaultValue={balance} />
        </Field>
        <Field label="Date received" htmlFor="date">
          <Input id="date" name="date" type="date" required defaultValue={today} max={today} />
        </Field>
      </div>
      <Field label="Paid by" htmlFor="method">
        <Select id="method" name="method" defaultValue="BANK_TRANSFER">
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CARD_IN_PERSON">Card (in person)</option>
          <option value="CASH">Cash</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </Select>
      </Field>
      <Field label="Reference (optional)" htmlFor="reference">
        <Input id="reference" name="reference" maxLength={80} placeholder="Bank reference, terminal receipt" />
      </Field>
      <Result state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Recording…' : 'Record payment'}
      </Button>
    </form>
  )
}

export function ReversePaymentForm({ id, paymentId }: { id: string; paymentId: string }) {
  const [state, formAction, pending] = useActionState(reversePaymentAction, initial)
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-micro font-medium text-zinc-deep underline-offset-2 hover:text-bad hover:underline">
        Reverse
      </button>
    )
  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input name="reason" required maxLength={300} aria-label="Reason" placeholder="Why? (entered twice, bounced…)" />
      <Result state={state} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="bg-bad hover:bg-bad/90">
          Reverse payment
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function VoidForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(voidInvoiceAction, initial)
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <Button type="button" variant="ghost" className="text-bad" onClick={() => setOpen(true)}>
        Void this invoice
      </Button>
    )
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-bad/30 bg-bad/5 p-4">
      <input type="hidden" name="id" value={id} />
      <Field label="Why is it being voided?" htmlFor="void-reason" hint="The number is kept and never reused. Raise a new invoice if this one was wrong.">
        <Input id="void-reason" name="reason" required maxLength={300} />
      </Field>
      <Result state={state} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="bg-bad hover:bg-bad/90">
          Void invoice
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  )
}
