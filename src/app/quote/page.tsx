import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { describeSpec, parseSpec, type DoorSpec } from '@/lib/configurator/options'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { can } from '@/lib/rbac'
import { offeredBrands, participatingBusinesses, type BusinessCard } from '@/lib/pricing/business'
import { productForSpec, productLabel } from '@/lib/pricing/products'
import { NotConnected } from '@/components/ui/NotConnected'
import { QuoteRequestForm } from './QuoteRequestForm'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Get quotes',
  description: 'Choose a company and get an automated quote for your design.',
}

type PageProps = { searchParams: Promise<{ spec?: string }> }

export default async function QuotePage({ searchParams }: PageProps) {
  const { spec: rawSpec } = await searchParams
  if (!rawSpec) redirect('/configure')

  let spec: DoorSpec
  try {
    spec = parseSpec(JSON.parse(rawSpec))
  } catch {
    redirect('/configure')
  }

  const encoded = JSON.stringify(spec)
  const { product } = productForSpec(spec)
  const session = await getSession()
  const mode = !session ? 'signed-out' : can(session.role, 'quote:request') ? 'customer' : 'business'

  let companies: BusinessCard[] = []
  let brands: string[] = []
  let unreachable = false
  try {
    ;[companies, brands] = await Promise.all([participatingBusinesses(product), offeredBrands(product)])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    unreachable = true
  }

  const rows = describeSpec(spec)
  const here = `/quote?spec=${encodeURIComponent(encoded)}`

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-6 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Get quotes</h1>
        <p className="mt-1 text-graphite-soft">
          Choose a company. Its own prices are matched to your design instantly.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-line bg-paper p-4 shadow-panel">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-graphite">{productLabel(product)}</h2>
            <Link
              href={`/configure?spec=${encodeURIComponent(encoded)}`}
              className="text-sm font-medium text-signal hover:text-signal-hover"
            >
              Edit design
            </Link>
          </div>
          <dl className="mt-3 flex flex-col gap-1.5">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-sm"
              >
                <dt className="text-zinc-deep">{row.label}</dt>
                <dd className="text-right text-graphite">{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <section className="min-w-0">
          {unreachable ? (
            <NotConnected
              feature="Automated quotes"
              reason="The database isn’t reachable right now, so company prices can’t be read."
            />
          ) : (
            <QuoteRequestForm
              spec={encoded}
              companies={companies}
              brands={brands}
              mode={mode}
              signInHref={`/sign-in?next=${encodeURIComponent(here)}`}
            />
          )}
        </section>
      </div>
    </div>
  )
}
