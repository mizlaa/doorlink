import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { companyContext, type CompanyContext } from '@/lib/quoting/company'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { EmptyState } from '@/components/ui/EmptyState'

export type PricingAccess =
  | { kind: 'ok'; ctx: CompanyContext }
  | { kind: 'no-business'; userId: string }
  | { kind: 'blocked'; screen: React.ReactNode }

/** Who may open the pricing area, decided on the server for every request. */
export async function pricingAccess(next: string): Promise<PricingAccess> {
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  if (!can(session.role, 'pricing:manage:own')) {
    return {
      kind: 'blocked',
      screen: (
        <EmptyState
          title="Automated pricing is for trade accounts"
          description="Businesses that install garage doors, gates, fences, window shutters or shop shutters can set their prices here with a Doorlink trade subscription."
        />
      ),
    }
  }
  const sub = await tradeSubscriptionAccess(session)
  if (!sub.allowed) return { kind: 'blocked', screen: <TradeSubscriptionPaywall /> }
  const ctx = await companyContext(session)
  return ctx ? { kind: 'ok', ctx } : { kind: 'no-business', userId: session.userId }
}
