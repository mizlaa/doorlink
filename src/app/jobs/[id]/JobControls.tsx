'use client'

import { useActionState, useState } from 'react'
import type { JobStatus } from '@prisma/client'
import { transitionJobAction, reviewJobAction, type JobActionState } from '../actions'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'

const initialState: JobActionState = {}

/**
 * Transitions are shown as the thing a person is doing ("Start work"),
 * not as the status they are writing ("IN_PROGRESS"). The status names
 * are the database's vocabulary; these are the trade's.
 */
const TRANSITION_LABELS: Record<JobStatus, string> = {
  REQUESTED: 'Move back to requested',
  ACCEPTED: 'Mark as accepted',
  AWAITING_PAYMENT: 'Mark as awaiting payment',
  SCHEDULED: 'Book a time',
  IN_PROGRESS: 'Start work',
  COMPLETED: 'Mark as complete',
  CANCELLED: 'Cancel this job',
  DISPUTED: 'Raise a dispute',
}

const TRANSITION_PROMPTS: Partial<Record<JobStatus, string>> = {
  SCHEDULED: 'Pick the time you have agreed with the other side. They will see it on this page.',
  IN_PROGRESS: 'This tells the customer you are on site and have started.',
  COMPLETED: 'Only mark this complete once the work is genuinely finished. The customer is asked to review it next.',
  CANCELLED: 'Cancelling is final. Say why, so there is a record both sides can read.',
  DISPUTED: 'Describe what has gone wrong. A Doorlink admin reviews disputes before a job can move again.',
}

// Which transitions need more than a confirmation before they are safe
// to write.
const NEEDS_SCHEDULE: JobStatus[] = ['SCHEDULED']
const NEEDS_REASON: JobStatus[] = ['CANCELLED', 'DISPUTED']
const DESTRUCTIVE: JobStatus[] = ['CANCELLED', 'DISPUTED']

export function JobTransitionControls({
  jobId,
  transitions,
}: {
  jobId: string
  transitions: JobStatus[]
}) {
  const [state, formAction, isPending] = useActionState(transitionJobAction, initialState)
  const [selected, setSelected] = useState<JobStatus | null>(null)

  // When the action succeeds the server re-renders this page with a new
  // set of allowed transitions. If the one being edited is no longer
  // among them, the panel closes itself rather than sitting open over a
  // move that has already happened.
  const active = selected && transitions.includes(selected) ? selected : null

  if (transitions.length === 0) return null

  if (!active) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {transitions.map((status) => (
            <Button
              key={status}
              type="button"
              variant={DESTRUCTIVE.includes(status) ? 'secondary' : 'primary'}
              onClick={() => setSelected(status)}
            >
              {TRANSITION_LABELS[status]}
            </Button>
          ))}
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-bad">
            {state.error}
          </p>
        )}
      </div>
    )
  }

  const needsSchedule = NEEDS_SCHEDULE.includes(active)
  const needsReason = NEEDS_REASON.includes(active)

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-rail p-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="toStatus" value={active} />

      <p className="text-sm text-graphite">
        <span className="font-medium">{TRANSITION_LABELS[active]}.</span>{' '}
        {TRANSITION_PROMPTS[active]}
      </p>

      {needsSchedule && (
        <Field label="Date and time" htmlFor="scheduledAt">
          <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required />
        </Field>
      )}

      <Field
        label={needsReason ? 'Reason' : 'Note'}
        htmlFor="note"
        hint={needsReason ? 'Both sides can see this.' : 'Optional. Both sides can see this.'}
      >
        <Textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          required={needsReason}
          minLength={needsReason ? 10 : undefined}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Confirm'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setSelected(null)} disabled={isPending}>
          Back
        </Button>
      </div>
    </form>
  )
}

export function ReviewForm({
  jobId,
  existing,
}: {
  jobId: string
  existing: { rating: number; body: string | null } | null
}) {
  const [state, formAction, isPending] = useActionState(reviewJobAction, initialState)
  const [rating, setRating] = useState(existing?.rating ?? 0)

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-paper p-4">
      <input type="hidden" name="jobId" value={jobId} />

      <StarRating value={rating} onChange={setRating} />

      <Field
        label="What was the work like?"
        htmlFor="body"
        hint="Optional. Other customers will read this on the technician's profile."
      >
        <Textarea id="body" name="body" rows={4} maxLength={2000} defaultValue={existing?.body ?? ''} />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-good">Review saved.</p>}

      <div>
        <Button type="submit" disabled={isPending || rating === 0}>
          {isPending ? 'Saving…' : existing ? 'Update review' : 'Publish review'}
        </Button>
      </div>
    </form>
  )
}

// Radios rather than buttons, so the rating is a real form control:
// keyboard-reachable, arrow-key navigable, and submitted natively.
function StarRating({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-graphite">Rating</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded p-0.5 text-2xl leading-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-signal"
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <span aria-hidden="true" className={n <= value ? 'text-caution' : 'text-line'}>
              ★
            </span>
            <span className="sr-only">
              {n} star{n === 1 ? '' : 's'}
            </span>
          </label>
        ))}
        <span className="ml-2 text-sm text-zinc-deep">
          {value === 0 ? 'Choose a rating' : `${value} of 5`}
        </span>
      </div>
    </fieldset>
  )
}
