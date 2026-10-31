'use client'

import { useActionState } from 'react'
import { saveAiSettingsAction, type AiSettingsState } from './actions'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'

const initialState: AiSettingsState = {}

export function AiSettingsForm({
  initial,
}: {
  initial: { cost: string; perHour: number; perDay: number; dailyCap: number }
}) {
  const [state, formAction, isPending] = useActionState(saveAiSettingsAction, initialState)
  return (
    <form action={formAction} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <Field label="Cost per image ($)" htmlFor="cost" hint="From your image provider’s pricing or invoice. Used for the spend figures.">
        <Input id="cost" name="cost" inputMode="decimal" defaultValue={initial.cost} placeholder="Not set" />
      </Field>
      <Field label="Platform daily cap" htmlFor="dailyCap" hint="Most billable images per day, across everyone.">
        <Input id="dailyCap" name="dailyCap" inputMode="numeric" defaultValue={initial.dailyCap} />
      </Field>
      <Field label="Per customer per hour" htmlFor="perHour">
        <Input id="perHour" name="perHour" inputMode="numeric" defaultValue={initial.perHour} />
      </Field>
      <Field label="Per customer per day" htmlFor="perDay">
        <Input id="perDay" name="perDay" inputMode="numeric" defaultValue={initial.perDay} />
      </Field>
      <div className="sm:col-span-2">
        {state.error && <p role="alert" className="mb-2 text-sm text-bad">{state.error}</p>}
        {state.ok && <p className="mb-2 text-sm text-good">Saved.</p>}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save AI settings'}
        </Button>
      </div>
    </form>
  )
}
