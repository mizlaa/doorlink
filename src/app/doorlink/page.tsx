import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FEATURE_3D_V2 } from '@/lib/feature-flags'
import { introBusinesses } from '@/lib/pricing/intro-businesses'
import { DoorlinkExperience } from './DoorlinkExperience'

// The intro lists real, approved businesses, so it is read per request.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Doorlink',
  description: 'Explore the Doorlink property: garage doors, gates, fences and shutters, designed and quoted in one place.',
}

export default async function DoorlinkPage() {
  // Off unless the 3D experience is switched on for this build. A redirect,
  // not a not-found page: the latter is streamed with a 200 status.
  if (!FEATURE_3D_V2) redirect('/')
  const businesses = await introBusinesses()
  return <DoorlinkExperience businesses={businesses} />
}
