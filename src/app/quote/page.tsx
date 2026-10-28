import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { parseSpec } from '@/lib/configurator/options'
import { categoryFromSlug } from '@/lib/quoting/catalogue'
import { listParticipatingCompanies, optionsOffered } from '@/lib/quoting/quotes'
import { NotConnected } from '@/components/ui/NotConnected'
import { QuoteBuilder } from './QuoteBuilder'

// Per-user and per-business data: always rendered on request, never at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Design it and get a quote',
  description: 'Choose a garage door, gate, fence, window shutter or shop shutter, enter your measurements and get automated quotes from participating companies.',
  alternates: { canonical: '/quote' },
}

type PageProps = { searchParams: Promise<{ category?: string; spec?: string; width?: string; height?: string }> }

export default async function QuotePage({ searchParams }: PageProps) {
  const params = await searchParams
  const session = await getSession()
  const category = categoryFromSlug(params.category)?.id ?? 'GARAGE_DOOR'

  // A garage door designed in the 3D configurator arrives as its spec, read
  // through the configurator's own validator like any other untrusted input.
  let doorSpec = null
  if (params.spec) {
    try {
      doorSpec = parseSpec(JSON.parse(params.spec))
    } catch {
      doorSpec = null
    }
  }

  let companies, offered
  try {
    ;[companies, offered] = await Promise.all([listParticipatingCompanies(), optionsOffered()])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Automated quotes" reason="Can't reach the database right now." />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-shell overflow-x-hidden px-4 py-10 sm:py-14">
      <header className="mb-8 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Design it and get a quote</h1>
        <p className="mt-2 text-graphite-soft">
          Choose the product, enter your measurements, design it, then pick companies. Each company&apos;s quote is worked out from the prices that company set. Doorlink does not set prices.
        </p>
      </header>
      <QuoteBuilder
        signedIn={Boolean(session)}
        initialCategory={category}
        doorSpec={doorSpec}
        initialWidth={params.width}
        initialHeight={params.height}
        companies={companies.map((c) => ({ id: c.id, name: c.name, serviceArea: c.profile?.serviceArea ?? null, categories: c.categories, rating: c.rating }))}
        offered={offered}
      />
    </div>
  )
}
