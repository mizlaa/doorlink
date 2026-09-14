'use client'

import { useActionState, useState } from 'react'
import { decideDisputeAction, type DisputeActionState } from './actions'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea } from '@/components/ui/Field'

const initial: DisputeActionState = {}

type Decision = 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'

const LABELS: Record<Decision, string> = {
  IN_REVIEW: 'Mark as in review',
  RESOLVED: 'Resolve',
  REJECTED: 'Reject',
}

const PROMPTS: Record<Decision, string> = {
  IN_REVIEW: 'Tells both sides someone has picked this up. A note is optional here.',
  RESOLVED: 'You have decided in favour of the person who raised it. Say what happens and why.',
  REJECTED: 'You have decided against it. Say why — they have to be able to understand the call.',
}

export function DisputeForm({ disputeId, jobIsDisputed }: { disputeId: string; jobIsDisputed: boolean }) {
  const [state, formAction, isPending] = useActionState(decideDisputeAction, initial)
  const [decision, setDecision] = useState<Decision | null>(null)

  if (!decision) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LABELS) as Decision[]).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={option === 'RESOLVED' ? 'primary' : 'secondary'}
              onClick={() => setDecision(option)}
            >
              {LABELS[option]}
            </Button>
          ))}
        </div>
        {state.error && (
          <p role="alert" className="text-micro text-bad">
            {state.error}
          </p>
        )}
        {state.ok && <p className="text-micro text-good">Recorded.</p>}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-line bg-rail p-4">
      <input type="hidden" name="disputeId" value={disputeId} />
      <input type="hidden" name="decision" value={decision} />

      <p className="text-sm text-graphite">
        <span className="font-medium">{LABELS[decision]}.</span> {PROMPTS[decision]}
      </p>

      <Field
        label={decision === 'IN_REVIEW' ? 'Note' : 'Resolution'}
        htmlFor={`resolution-${disputeId}`}
        hint="Both people on the job see this."
      >
        <Textarea
          id={`resolution-${disputeId}`}
          name="resolution"
          rows={3}
          maxLength={1000}
          required={decision !== 'IN_REVIEW'}
        />
      </Field>

      {/* A dispute closed without deciding what happens to the job leaves
          the job stuck in DISPUTED with nothing either party can do. */}
      {decision !== 'IN_REVIEW' && jobIsDisputed && (
        <Field
          label="And the job becomes"
          htmlFor={`jobOutcome-${disputeId}`}
          hint="The job is sitting in Disputed and cannot move until you say."
        >
          <Select id={`jobOutcome-${disputeId}`} name="jobOutcome" defaultValue="LEAVE">
            <option value="LEAVE">Leave it disputed for now</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving…' : 'Confirm'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setDecision(null)}
          disabled={isPending}
        >
          Back
        </Button>
      </div>
    </form>
  )
}
