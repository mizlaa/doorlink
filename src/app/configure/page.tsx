import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { parseSpec } from '@/lib/configurator/options'
import { doorPreviewAvailable } from '@/lib/configurator/preview'
import { Configurator } from './Configurator'

export const metadata: Metadata = {
  title: 'Design your door',
  description:
    'Choose a door type, size, colour, finish and opener, see it on a house, and get quotes from technicians.',
  alternates: { canonical: '/configure' },
}

type PageProps = { searchParams: Promise<{ spec?: string }> }

export default async function ConfigurePage({ searchParams }: PageProps) {
  const { spec } = await searchParams
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

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Design your door</h1>
        <p className="mt-2 text-graphite-soft">
          Pick the type, size and finish, watch it change on the house, then send the specification to
          technicians in your area for a price.
        </p>
      </header>

      <Configurator
        signedIn={Boolean(session)}
        initialSpec={initialSpec}
        previewAvailable={doorPreviewAvailable()}
      />
    </div>
  )
}
