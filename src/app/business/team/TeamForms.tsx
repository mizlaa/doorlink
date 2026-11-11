'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { addTimeOffAction, changeRoleAction, inviteMemberAction, removeMemberAction, removeTimeOffAction, type TeamState } from './actions'

function Result({ state }: { state: TeamState }) {
  if (state.error) return <p role="alert" className="text-sm text-bad">{state.error}</p>
  if (state.message) return <p role="status" className="text-sm text-good">{state.message}</p>
  return null
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  // Clear after a success so the same thing isn't added twice; keep it after an error.
  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state])
  return (
    <form ref={formRef} action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <Field label="Their email on Doorlink" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Role" htmlFor="role">
          <Select id="role" name="role" defaultValue="TECHNICIAN">
            <option value="TECHNICIAN">Technician</option>
            <option value="MANAGER">Office manager</option>
          </Select>
        </Field>
      </div>
      <p className="text-micro text-zinc-deep">Technicians see their own visits on Today. Office managers also see requests, the calendar, customers and invoices, but not settings or the team.</p>
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add to team'}
      </Button>
      <Result state={state} />
    </form>
  )
}

export function MemberControls({ id, role }: { id: string; role: string }) {
  const [roleState, roleAction, rolePending] = useActionState(changeRoleAction, {})
  const [removeState, removeAction, removePending] = useActionState(removeMemberAction, {})
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={roleAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <Select name="role" defaultValue={role} aria-label="Role" className="h-9" onChange={(e) => e.currentTarget.form?.requestSubmit()} disabled={rolePending}>
          <option value="TECHNICIAN">Technician</option>
          <option value="MANAGER">Office manager</option>
        </Select>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" variant="ghost" className="text-bad" disabled={removePending} onClick={(e) => { if (!confirm('Remove them from the team? Their upcoming visits will need a new technician.')) e.preventDefault() }}>
          Remove
        </Button>
      </form>
      <Result state={roleState.error ? roleState : removeState} />
    </div>
  )
}

export function TimeOffForm({ people, today }: { people: Array<{ id: string; name: string }>; today: string }) {
  const [state, action, pending] = useActionState(addTimeOffAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  // Clear after a success so the same thing isn't added twice; keep it after an error.
  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state])
  return (
    <form ref={formRef} action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Who" htmlFor="technicianId">
          <Select id="technicianId" name="technicianId">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="First day" htmlFor="from">
          <Input id="from" name="from" type="date" required defaultValue={today} min={today} />
        </Field>
        <Field label="Last day" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={today} min={today} />
        </Field>
      </div>
      <Field label="Reason (optional)" htmlFor="reason">
        <Input id="reason" name="reason" maxLength={200} placeholder="Leave, training…" />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        Add time off
      </Button>
      <Result state={state} />
    </form>
  )
}

export function RemoveTimeOff({ id }: { id: string }) {
  const [, action, pending] = useActionState(removeTimeOffAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Remove
      </Button>
    </form>
  )
}
