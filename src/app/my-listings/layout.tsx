import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'

export default async function MyListingsLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  // Every role has listing:write:own — this is a peer-to-peer marketplace,
  // not one gated behind registering as a business. The check stays
  // explicit anyway rather than just testing for a session, so a future
  // role added without it is still protected by default.
  if (!can(session.role, 'listing:write:own')) redirect('/')

  const tradeAccess = await tradeSubscriptionAccess(session)
  if (!tradeAccess.allowed) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <TradeSubscriptionPaywall />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <div className="mb-8 flex flex-col gap-1 border-b border-line pb-6">
        <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Your account</p>
        <h1 className="text-2xl font-semibold text-graphite">Your listings</h1>
      </div>
      {children}
    </div>
  )
}
