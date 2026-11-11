'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { acceptRequestAction, declineRequestAction, type RequestActionState } from './actions'

const initial: RequestActionState = {}

export function RequestButtons({ requestId }: { requestId: string }) {
  const [accept, acceptAction, accepting] = useActionState(acceptRequestAction, initial)
  const [decline, declineAction, declining] = useActionState(declineRequestAction, initial)
  const [passing, setPassing] = useState(false)
  const error = accept.error ?? decline.error
  return (
    <div className="mt-4">
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {passing ? (
        <form action={declineAction} className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="requestId" value={requestId} />
          <Input name="reason" aria-label="Reason (optional)" placeholder="Reason, if you’d like to give one" maxLength={300} className="sm:flex-1" />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={declining}>
              {declining ? 'Passing…' : 'Confirm pass'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPassing(false)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={acceptAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <Button type="submit" disabled={accepting} className="px-6">
              {accepting ? 'Accepting…' : 'Accept and book a time'}
            </Button>
          </form>
          <Button type="button" variant="ghost" onClick={() => setPassing(true)}>
            Pass
          </Button>
        </div>
      )}
    </div>
  )
}
