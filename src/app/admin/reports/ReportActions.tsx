'use client'

import { useActionState } from 'react'
import { decideReportAction, type ReportActionState } from './actions'
import { Button } from '@/components/ui/Button'

const initial: ReportActionState = {}

const LABELS = {
  IN_REVIEW: 'Reviewing',
  ACTIONED: 'Actioned',
  DISMISSED: 'Dismiss',
} as const

export function ReportActions({ reportId }: { reportId: string }) {
  const [state, formAction, isPending] = useActionState(decideReportAction, initial)

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((decision) => (
          <Button
            key={decision}
            type="submit"
            name="decision"
            value={decision}
            size="sm"
            variant={decision === 'ACTIONED' ? 'primary' : 'secondary'}
            disabled={isPending}
          >
            {LABELS[decision]}
          </Button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-micro text-bad">
          {state.error}
        </p>
      )}
    </form>
  )
}
