import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { describeSpec, parseSpec, type DoorSpec } from '@/lib/configurator/options'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { can } from '@/lib/rbac'
import { offeredBrands } from '@/lib/pricing/business'
import { accessoriesFor } from '@/lib/pricing/accessories'
import { productForSpec, productLabel, specNeedsMotor } from '@/lib/pricing/products'
import { prisma } from '@/lib/prisma'
import { NotConnected } from '@/components/ui/NotConnected'
import { CompareForm } from './CompareForm'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Compare free quotes',
  description: 'Compare prices for your design from every business that services your area.',
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

  let brands: string[] = []
  let defaults = { postcode: '', suburb: '' }
  let unreachable = false
  try {
    const [offered, last] = await Promise.all([
      offeredBrands(product),
      session
        ? prisma.quoteComparison.findFirst({
            where: { customerId: session.userId },
            orderBy: { createdAt: 'desc' },
            select: { postcode: true, suburb: true },
          })
        : null,
    ])
    brands = offered
    if (last) defaults = { postcode: last.postcode, suburb: last.suburb ?? '' }
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    unreachable = true
  }
  const accessories = accessoriesFor(product, specNeedsMotor(spec)).map((a) => ({ id: a.id, label: a.label }))

  const rows = describeSpec(spec)
  const here = `/quote?spec=${encodeURIComponent(encoded)}`

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-6 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Compare free quotes</h1>
        <p className="mt-1 text-graphite-soft">
          Every approved business that services your postcode is priced on your design instantly, from its own
          prices.
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
            <CompareForm
              spec={encoded}
              brands={brands}
              accessories={accessories}
              mode={mode}
              defaults={defaults}
              signInHref={`/sign-in?next=${encodeURIComponent(here)}`}
            />
          )}
        </section>
      </div>
    </div>
  )
}
