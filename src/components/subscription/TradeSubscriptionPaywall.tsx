import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export function TradeSubscriptionPaywall() {
  return (
    <div className="mx-auto max-w-prose rounded-md border border-line bg-rail p-6">
      <h1 className="text-lg font-semibold text-graphite">Trade subscription required</h1>
      <p className="mt-2 text-sm text-graphite-soft">
        Technicians, suppliers, and manufacturers need an active Doorlink trade subscription to use this
        part of the app. Customers do not need a subscription to request quotes or use the configurator.
      </p>
      <p className="mt-2 text-sm text-graphite-soft">
        The compliance pack and photo preview credits are separate purchases.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/plans">
          <Button type="button">View plans</Button>
        </Link>
        <Link href="/account/subscription" className="inline-flex h-11 items-center text-sm font-medium text-signal hover:text-signal-hover">
          Manage billing
        </Link>
      </div>
    </div>
  )
}
