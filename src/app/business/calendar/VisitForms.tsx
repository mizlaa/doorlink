'use client'

import { useActionState, useEffect, useState } from 'react'
import { APPOINTMENT_KINDS, DURATIONS, durationLabel, nextAction } from '@/lib/appointments/rules'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { bookAction, cancelVisitAction, moveVisitAction, rescheduleAction, type CalendarState } from './actions'

const initial: CalendarState = {}

export interface Option {
  id: string
  label: string
}

function Feedback({ state, confirmLabel }: { state: CalendarState; confirmLabel: string }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
        {state.error}
      </p>
    )
  if (state.warnings?.length)
    return (
      <div role="alert" className="rounded-md border border-caution/30 bg-caution-tint px-3 py-2 text-sm text-graphite">
        <p className="font-semibold">Check before you book</p>
        <ul className="mt-1 list-disc pl-5">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <Button type="submit" name="confirm" value="1" variant="secondary" className="mt-3">
          {confirmLabel}
        </Button>
      </div>
    )
  return null
}

function WhenFields({ defaults, technicians }: { defaults: { date: string; time: string; duration: number; technicianId: string }; technicians: Option[] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Date" htmlFor="date">
          <Input id="date" name="date" type="date" required defaultValue={defaults.date} />
        </Field>
        <Field label="Start" htmlFor="time">
          <Input id="time" name="time" type="time" required step={300} defaultValue={defaults.time} />
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Length" htmlFor="duration">
            <Select id="duration" name="duration" defaultValue={String(defaults.duration)}>
              {[...new Set([...DURATIONS, defaults.duration])].sort((a, b) => a - b).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {durationLabel(minutes)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <Field label="Technician" htmlFor="technicianId" hint="A technician can’t be booked for two visits at the same time.">
        <Select id="technicianId" name="technicianId" defaultValue={defaults.technicianId}>
          <option value="">Unassigned for now</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  )
}

export function BookingForm({
  jobs,
  customers,
  technicians,
  defaults,
}: {
  jobs: Array<Option & { customerId: string | null; hint: string }>
  customers: Option[]
  technicians: Option[]
  defaults: { jobId: string; customerId: string; date: string; time: string; technicianId: string; kind: string }
}) {
  const [state, formAction, pending] = useActionState(bookAction, initial)
  const [jobId, setJobId] = useState(defaults.jobId)
  const [kind, setKind] = useState(defaults.kind)
  const [duration, setDuration] = useState(APPOINTMENT_KINDS.find((k) => k.id === defaults.kind)?.minutes ?? 60)
  const job = jobs.find((j) => j.id === jobId)
  const kindLabel = APPOINTMENT_KINDS.find((k) => k.id === kind)?.label ?? 'Visit'
  const [title, setTitle] = useState('')
  const [titleEdited, setTitleEdited] = useState(false)
  // The title writes itself from the kind and the job until someone types their own.
  useEffect(() => {
    if (!titleEdited) setTitle(job ? `${kindLabel}: ${job.label}` : kindLabel)
  }, [kindLabel, job, titleEdited])

  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-5">
      <Field label="Job" htmlFor="jobId" hint={job?.hint ?? 'Linking a job carries its customer, address and design to the visit.'}>
        <Select id="jobId" name="jobId" value={jobId} onChange={(event) => setJobId(event.target.value)}>
          <option value="">No job (a one-off visit)</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </Select>
      </Field>
      {!job && customers.length > 0 && (
        <Field label="Customer" htmlFor="customerId">
          <Select id="customerId" name="customerId" defaultValue={defaults.customerId}>
            <option value="">None</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-graphite">What is it for?</legend>
        <div className="flex flex-wrap gap-2">
          {APPOINTMENT_KINDS.map((k) => (
            <label
              key={k.id}
              className="cursor-pointer rounded-full border border-line bg-paper px-3.5 py-2 text-sm text-graphite has-[:checked]:border-signal has-[:checked]:bg-signal has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal"
            >
              <input
                type="radio"
                name="kind"
                value={k.id}
                checked={kind === k.id}
                onChange={() => {
                  setKind(k.id)
                  setDuration(k.minutes)
                }}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <WhenFields key={duration} defaults={{ date: defaults.date, time: defaults.time, duration, technicianId: defaults.technicianId }} technicians={technicians} />

      <Field label="Title" htmlFor="title">
        <Input
          id="title"
          name="title"
          required
          maxLength={140}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setTitleEdited(true)
          }}
        />
      </Field>
      <Field label="Notes for the technician (optional)" htmlFor="notes">
        <Textarea id="notes" name="notes" maxLength={2000} className="min-h-20" />
      </Field>

      <Feedback state={state} confirmLabel="Book anyway" />
      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        {pending ? 'Booking…' : 'Book visit'}
      </Button>
    </form>
  )
}

export function RescheduleForm({
  id,
  version,
  technicians,
  defaults,
}: {
  id: string
  version: number
  technicians: Option[]
  defaults: { date: string; time: string; duration: number; technicianId: string; notes: string }
}) {
  const [state, formAction, pending] = useActionState(rescheduleAction, initial)
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <WhenFields defaults={defaults} technicians={technicians} />
      <Field label="Notes for the technician" htmlFor="notes">
        <Textarea id="notes" name="notes" maxLength={2000} className="min-h-20" defaultValue={defaults.notes} />
      </Field>
      <Feedback state={state} confirmLabel="Save anyway" />
      {state.ok && <p className="text-sm text-good">Saved. The customer and technician have been told.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}

export function CancelForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(cancelVisitAction, initial)
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <Button type="button" variant="ghost" className="text-bad" onClick={() => setOpen(true)}>
        Cancel this visit
      </Button>
    )
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-3 rounded-lg border border-bad/30 bg-bad/5 p-4">
      <input type="hidden" name="id" value={id} />
      <Field label="Why is it being cancelled?" htmlFor="reason" hint="The customer sees this.">
        <Input id="reason" name="reason" required maxLength={500} />
      </Field>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="bg-bad hover:bg-bad/90">
          {pending ? 'Cancelling…' : 'Cancel visit'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  )
}

/** The technician's one next step, with notes and photos at the end. */
export function VisitProgress({ id, status, photosAvailable, hasJob }: { id: string; status: string; photosAvailable: boolean; hasJob: boolean }) {
  const [state, formAction, pending] = useActionState(moveVisitAction, initial)
  const next = nextAction(status)
  if (!next) return null
  const finishing = next.to === 'COMPLETED'
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {finishing && (
        <>
          <Field label="What was done?" htmlFor={`notes-${id}`} hint="Goes on the job for the office and the customer.">
            <Textarea id={`notes-${id}`} name="notes" maxLength={2000} className="min-h-24" />
          </Field>
          {hasJob && photosAvailable && (
            <Field label="Photos (optional, up to 6)" htmlFor={`photos-${id}`}>
              <Input id={`photos-${id}`} name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" className="h-auto py-2" />
            </Field>
          )}
        </>
      )}
      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="to" value={next.to} size="lg" className="h-14 flex-1 text-base" disabled={pending}>
          {pending ? 'Saving…' : next.label}
        </Button>
        {(status === 'BOOKED' || status === 'EN_ROUTE') && (
          <Button type="submit" name="to" value="NO_SHOW" variant="secondary" className="h-14" disabled={pending}>
            No one home
          </Button>
        )}
      </div>
    </form>
  )
}
