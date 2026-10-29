'use client'

import { useActionState, useState } from 'react'
import { updateCommissionAction, type SettingsFormState } from './actions'
import { Field, Input } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { calculateSplit, MAX_COMMISSION_BPS } from '@/lib/commission'
import { formatMoney } from '@/lib/money'

const initialState: SettingsFormState = {}

// A fixed amount to work the arithmetic against. It is labelled as an
// example so nobody mistakes it for a real job, and it exists because
// "12.5%" and "$62.50 off a $500 job" are different amounts of
// information when you are deciding what to charge people.
const EXAMPLE_JOB_CENTS = 500_000

export function CommissionForm({ currentBps }: { currentBps: number }) {
  const [state, formAction, isPending] = useActionState(updateCommissionAction, initialState)
  const [percent, setPercent] = useState((currentBps / 100).toString())

  const parsed = Number(percent)
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed * 100 <= MAX_COMMISSION_BPS
  const previewBps = valid ? Math.round(parsed * 100) : null
  const split = previewBps === null ? null : calculateSplit(EXAMPLE_JOB_CENTS, previewBps)
  const changed = previewBps !== null && previewBps !== currentBps

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field
        label="Commission"
        htmlFor="percent"
        hint={`Percentage of the agreed job price. Up to ${MAX_COMMISSION_BPS / 100}%, two decimal places.`}
      >
        <div className="flex items-center gap-2">
          <Input
            id="percent"
            name="percent"
            type="number"
            min="0"
            max={MAX_COMMISSION_BPS / 100}
            step="0.01"
            inputMode="decimal"
            required
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            className="max-w-32"
          />
          <span className="text-sm text-graphite-soft">%</span>
        </div>
      </Field>

      {split && (
        <dl className="rounded-md border border-line bg-rail p-4 text-sm">
          <p className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">
            On an example {formatMoney(EXAMPLE_JOB_CENTS)} job
          </p>
          <div className="flex justify-between">
            <dt className="text-graphite-soft">Customer pays</dt>
            <dd className="font-medium text-graphite">{formatMoney(split.grossCents)}</dd>
          </div>
          <div className="mt-1 flex justify-between">
            <dt className="text-graphite-soft">Doorlink takes</dt>
            <dd className="text-graphite">{formatMoney(split.commissionCents)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-1">
            <dt className="font-medium text-graphite">Business receives</dt>
            <dd className="font-medium text-graphite">{formatMoney(split.workerPayoutCents)}</dd>
          </div>
        </dl>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      {state.ok && !changed && <p className="text-sm text-good">Saved.</p>}

      <div>
        <Button type="submit" disabled={isPending || !changed}>
          {isPending ? 'Saving…' : 'Save commission rate'}
        </Button>
      </div>
    </form>
  )
}
