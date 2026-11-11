import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { parseSpec } from '@/lib/configurator/options'
import { aiImagesAvailable } from '@/lib/ai/design-image'
import { LOCATION_COOKIE, parseLocationCookie, readLocation } from '@/lib/location'
import { loadMotorCandidates } from '@/lib/motors/catalogue'
import { Designer } from './Designer'

export const metadata: Metadata = {
  title: 'Design your garage door',
  description:
    'Design a garage door, gate, fence or shutter on a house in 3D, compare local companies’ own prices and request a free on-site measure.',
  alternates: { canonical: '/configure' },
}

export const viewport: Viewport = {
  themeColor: '#0E1A2A',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

type PageProps = { searchParams: Promise<{ spec?: string; postcode?: string; suburb?: string }> }

export default async function ConfigurePage({ searchParams }: PageProps) {
  const params = await searchParams
  const session = await getSession()

  // A design can arrive in the URL (a shared link, coming back from sign-in).
  // It goes through the same validator as a stored one: nothing from a
  // query string is trusted to be a well-formed design.
  let initialSpec
  if (params.spec) {
    try {
      initialSpec = parseSpec(JSON.parse(params.spec))
    } catch {
      initialSpec = undefined
    }
  }

  const store = await cookies()
  const initialLocation =
    (params.postcode ? readLocation({ postcode: params.postcode, suburb: params.suburb }) : null) ??
    parseLocationCookie(store.get(LOCATION_COOKIE)?.value)

  const motors = await loadMotorCandidates()

  return (
    <Designer
      signedIn={Boolean(session)}
      role={session?.role ?? null}
      motors={motors}
      initialSpec={initialSpec}
      initialLocation={initialLocation}
      previewAvailable={aiImagesAvailable()}
    />
  )
}
