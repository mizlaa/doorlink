import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { parseSpec } from '@/lib/configurator/options'
import { doorPreviewAvailable } from '@/lib/configurator/preview'
import { ensureWelcomeCredits, getCreditBalance, listCreditPacksForPurchase } from '@/lib/credits/credits'
import { subscriptionCheckoutAvailable } from '@/lib/payments'
import { loadMotorCandidates } from '@/lib/motors/catalogue'
import { Configurator } from './Configurator'

export const metadata: Metadata = {
  title: 'Design your door, gate or shutter',
  description:
    'Design a garage door, gate, fence or window shutter, see it in 3D, match a motor to it, and get quotes from technicians.',
  alternates: { canonical: '/configure' },
}

type PageProps = { searchParams: Promise<{ spec?: string; credits?: string }> }

export default async function ConfigurePage({ searchParams }: PageProps) {
  const params = await searchParams
  const { spec } = params
  const session = await getSession()

  // A spec can arrive in the URL (from a shared link or a back button).
  // It is parsed through the same validator as a stored one — nothing
  // from a query string is trusted to be a well-formed configuration.
  let initialSpec
  if (spec) {
    try {
      initialSpec = parseSpec(JSON.parse(spec))
    } catch {
      initialSpec = undefined
    }
  }

  const previewAvailable = doorPreviewAvailable()
  const creditsCheckoutReady = subscriptionCheckoutAvailable()

  if (session && previewAvailable) {
    try {
      await ensureWelcomeCredits(session.userId)
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
  }

  let creditBalance: number | null = null
  let creditPacks: Awaited<ReturnType<typeof listCreditPacksForPurchase>> = []
  if (session && previewAvailable) {
    try {
      creditBalance = await getCreditBalance(session.userId)
      if (creditsCheckoutReady) {
        creditPacks = await listCreditPacksForPurchase()
      }
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
  }

  const motors = await loadMotorCandidates()

  return (
    <div className="mx-auto w-full min-w-0 max-w-shell overflow-x-hidden px-4 py-10 sm:py-14">
      <header className="mb-8 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">
          Design your door, gate or shutter
        </h1>
        <p className="mt-2 text-graphite-soft">
          Pick a style, match a motor, then get quotes from local technicians.
        </p>
      </header>

      <Configurator
        signedIn={Boolean(session)}
        motors={motors}
        initialSpec={initialSpec}
        previewAvailable={previewAvailable}
        creditBalance={creditBalance}
        creditPacks={creditPacks}
        creditsCheckoutReady={creditsCheckoutReady}
        creditsCheckoutNotice={
          params.credits === 'success'
            ? 'Payment submitted. Your balance updates once Stripe confirms the purchase.'
            : params.credits === 'cancel'
              ? 'Checkout was cancelled. You were not charged.'
              : null
        }
      />
    </div>
  )
}
