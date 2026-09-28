'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { startSubscriptionCheckout } from '@/app/plans/actions'

type Props = {
  planId: string
  canSubscribe: boolean
  reason: string | null
  showSignIn: boolean
}

export function PlansSubscribePanel({ planId, canSubscribe, reason, showSignIn }: Props) {
  const [nativeApp, setNativeApp] = useState(false)

  useEffect(() => {
    setNativeApp(typeof window !== 'undefined' && 'Capacitor' in window)
  }, [])

  if (nativeApp && canSubscribe) {
    return (
      <p className="rounded border border-line bg-rail px-3 py-2.5 text-sm text-graphite-soft">
        Subscribe on the Doorlink website in your browser, then sign in here. App Store and Play Store
        billing is not used for this subscription.
      </p>
    )
  }

  if (canSubscribe) {
    return (
      <form action={startSubscriptionCheckout}>
        <input type="hidden" name="planId" value={planId} />
        <Button type="submit" className="w-full">
          Subscribe
        </Button>
      </form>
    )
  }

  if (showSignIn) {
    return (
      <Link
        href="/sign-in?next=/plans"
        className="inline-flex h-11 w-full items-center justify-center rounded bg-signal text-sm font-medium text-paper hover:bg-signal-hover"
      >
        Sign in to subscribe
      </Link>
    )
  }

  return (
    <p className="rounded border border-line bg-rail px-3 py-2.5 text-sm text-graphite-soft">
      {reason ?? 'Ready to subscribe.'}
    </p>
  )
}
