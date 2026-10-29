import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { businessKeyFor, loadBusinessDetails, pricingSession } from '@/lib/pricing/business'
import { BusinessDetailsForm } from './BusinessDetailsForm'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Business details' }

export default async function BusinessDetailsPage() {
  const session = await pricingSession(await getSession())
  if (!session) return null
  const details = await loadBusinessDetails(businessKeyFor(session))
  if (!details) return null

  return (
    <section className="max-w-xl rounded-lg border border-line bg-paper p-5 shadow-panel">
      <h2 className="mb-4 text-sm font-medium text-graphite">Business details</h2>
      <BusinessDetailsForm initial={details} />
    </section>
  )
}
