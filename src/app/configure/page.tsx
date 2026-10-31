import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { parseSpec } from '@/lib/configurator/options'
import { aiImagesAvailable } from '@/lib/ai/design-image'
import { loadMotorCandidates } from '@/lib/motors/catalogue'
import { Configurator } from './Configurator'

export const metadata: Metadata = {
  title: 'Design your door, gate or shutter',
  description:
    'Design a garage door, gate, fence or window shutter, see it in 3D, match a motor to it, and get quotes from technicians.',
  alternates: { canonical: '/configure' },
}

type PageProps = { searchParams: Promise<{ spec?: string }> }

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

  const previewAvailable = aiImagesAvailable()

  const motors = await loadMotorCandidates()

  return (
    <div className="mx-auto w-full min-w-0 max-w-shell overflow-x-clip px-4 py-10 sm:py-14">
      <header className="mb-6 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Design</h1>
        <p className="mt-1 text-graphite-soft">Pick a style and size, then get quotes.</p>
      </header>

      <Configurator
        signedIn={Boolean(session)}
        motors={motors}
        initialSpec={initialSpec}
        previewAvailable={previewAvailable}
      />
    </div>
  )
}
