'use client'

import { useActionState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import type { LineInput } from '@/lib/invoices/money'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { LineItemsEditor, type StockOption } from '@/components/invoices/LineItemsEditor'
import { saveInvoiceAction, type InvoiceState } from '../../actions'

const initial: InvoiceState = {}

export function EditForm({
  id,
  lines,
  gstRegistered,
  pricesIncludeGst,
  dueDate,
  notes,
  stock,
  paidCents,
  termsHint,
}: {
  id: string
  lines: LineInput[]
  gstRegistered: boolean
  pricesIncludeGst: boolean
  dueDate: string
  notes: string
  stock: StockOption[]
  paidCents: number
  termsHint: string
}) {
  const [state, formAction, pending] = useActionState(saveInvoiceAction, initial)
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={id} />
      <LineItemsEditor initial={lines} gstRegistered={gstRegistered} initialIncludesGst={pricesIncludeGst} stock={stock} paidCents={paidCents} />
      <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field label="Due date" htmlFor="dueDate" hint={termsHint}>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={dueDate} />
        </Field>
        <Field label="Notes on the invoice (optional)" htmlFor="notes">
          <Textarea id="notes" name="notes" maxLength={2000} defaultValue={notes} className="min-h-20" />
        </Field>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        {pending ? 'Saving…' : 'Next: preview'}
      </Button>
    </form>
  )
}
