'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { addStockItemAction, adjustStockAction, updateStockItemAction, type StockState } from './actions'

function Result({ state }: { state: StockState }) {
  if (state.error) return <p role="alert" className="text-sm text-bad">{state.error}</p>
  if (state.message) return <p role="status" className="text-sm text-good">{state.message}</p>
  return null
}

export function AddItemForm() {
  const [state, action, pending] = useActionState(addStockItemAction, {})
  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-3">
      <Field label="Item" htmlFor="name">
        <Input id="name" name="name" required maxLength={120} placeholder="Torsion spring 225 mm" />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Code (optional)" htmlFor="sku">
          <Input id="sku" name="sku" maxLength={40} />
        </Field>
        <Field label="Unit" htmlFor="unit">
          <Input id="unit" name="unit" maxLength={16} defaultValue="each" />
        </Field>
        <Field label="On hand" htmlFor="onHand">
          <Input id="onHand" name="onHand" inputMode="decimal" defaultValue="0" />
        </Field>
        <Field label="Reorder at" htmlFor="reorder">
          <Input id="reorder" name="reorder" inputMode="decimal" defaultValue="0" />
        </Field>
      </div>
      <Field label="Sell price inc GST (optional)" htmlFor="sell" hint="Filled in when you add it to an invoice.">
        <Input id="sell" name="sell" inputMode="decimal" placeholder="0.00" />
      </Field>
      <Button type="submit" disabled={pending}>
        Add item
      </Button>
      <Result state={state} />
    </form>
  )
}

export function AdjustForm({ id, unit, reorder }: { id: string; unit: string; reorder: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(adjustStockAction, {})
  const [levelState, levelAction, levelPending] = useActionState(updateStockItemAction, {})
  if (!open)
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Update
      </Button>
    )
  return (
    <div className="flex w-full flex-col gap-3 rounded border border-line bg-paper p-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <Select name="kind" aria-label="What happened" defaultValue="RECEIVED" className="h-10 w-36">
          <option value="RECEIVED">Received</option>
          <option value="USED">Used</option>
          <option value="COUNT">Counted</option>
        </Select>
        <Input name="quantity" inputMode="decimal" required aria-label={`Quantity (${unit})`} placeholder={unit} className="h-10 w-24" />
        <Input name="note" aria-label="Note" placeholder="Note (optional)" maxLength={200} className="h-10 min-w-0 flex-1" />
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
      </form>
      <form action={levelAction} onSubmit={keepValuesOnSubmit(levelAction)} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex items-center gap-2 text-sm text-graphite-soft">
          Reorder at
          <Input name="reorder" inputMode="decimal" defaultValue={reorder} className="h-10 w-20" />
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={levelPending}>
          Set
        </Button>
        <Button type="submit" name="archive" value="1" size="sm" variant="ghost" className="text-bad" disabled={levelPending}>
          Stop tracking
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </form>
      <Result state={state.error ? state : levelState} />
    </div>
  )
}
