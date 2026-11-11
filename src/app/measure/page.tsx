import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { parseSpec, type DoorSpec } from '@/lib/configurator/options'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { LOCATION_COOKIE, parseLocationCookie, readLocation } from '@/lib/location'
import { localCompanies } from '@/lib/pricing/local'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/rbac'
import { DesignSummary } from '@/components/designer/DesignSummary'
import { MeasureForm, type MeasureCompany } from './MeasureForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Request an on-site measure',
  description: 'Send your design to local companies and book a free on-site measure.',
  robots: { index: false },
}

type PageProps = { searchParams: Promise<{ spec?: string; postcode?: string; suburb?: string; business?: string }> }

export default async function MeasurePage({ searchParams }: PageProps) {
  const params = await searchParams
  if (!params.spec) redirect('/configure')
  let spec: DoorSpec
  try {
    spec = parseSpec(JSON.parse(params.spec))
  } catch {
    redirect('/configure')
  }
  const encoded = JSON.stringify(spec)
  const session = await getSession()
  const store = await cookies()
  const location =
    (params.postcode ? readLocation({ postcode: params.postcode, suburb: params.suburb }) : null) ??
    parseLocationCookie(store.get(LOCATION_COOKIE)?.value)

  const back = new URLSearchParams({ spec: encoded })
  if (location) {
    back.set('postcode', location.postcode)
    if (location.suburb) back.set('suburb', location.suburb)
  }
  const here = `/measure?${back.toString()}${params.business ? `&business=${encodeURIComponent(params.business)}` : ''}`

  let companies: MeasureCompany[] = []
  let phone = ''
  if (session && location) {
    try {
      const [local, user] = await Promise.all([
        localCompanies(spec, location.postcode, { showPrices: false, limit: 8 }),
        prisma.user.findUnique({ where: { id: session.userId }, select: { phone: true } }),
      ])
      companies = local.map((c) => ({
        key: c.key,
        name: c.name,
        verified: c.verified,
        rating: c.ratingAvg !== null && c.ratingCount > 0 ? `${c.ratingAvg.toFixed(1)} from ${c.ratingCount} review${c.ratingCount === 1 ? '' : 's'}` : null,
      }))
      phone = user?.phone ?? ''
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link href={`/configure?${back.toString()}`} className="text-sm font-medium text-signal hover:text-signal-hover">
        ← Back to your design
      </Link>
      <header className="mb-5 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Request an on-site measure</h1>
        <p className="mt-1 text-graphite-soft">A local company visits, measures up and confirms a price. It’s free.</p>
      </header>

      <div className="mb-6">
        <DesignSummary spec={spec} compact />
      </div>

      {!session ? (
        <div className="rounded-lg border border-line bg-rail p-5">
          <p className="font-semibold text-graphite">Sign in to send it</p>
          <p className="mt-1 text-sm text-graphite-soft">
            A free account lets you follow the request, see the appointment and keep your quote, invoice and receipt in one place. Your design
            comes with you.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/sign-in?next=${encodeURIComponent(here)}`}
              className="inline-flex h-11 items-center rounded bg-signal px-5 text-sm font-semibold text-paper hover:bg-signal-hover"
            >
              Sign in
            </Link>
            <Link
              href={`/register?next=${encodeURIComponent(here)}`}
              className="inline-flex h-11 items-center rounded border border-line bg-paper px-5 text-sm font-semibold text-graphite hover:bg-rail"
            >
              Create a free account
            </Link>
          </div>
        </div>
      ) : !can(session.role, 'quote:request') ? (
        <div className="rounded-lg border border-line bg-rail p-5 text-sm text-graphite-soft">
          <p className="font-semibold text-graphite">Measure requests are for customer accounts</p>
          <p className="mt-1">You’re signed in with a business account. Requests from customers arrive in your business inbox.</p>
          <Link href="/business/requests" className="mt-3 inline-block font-medium text-signal hover:text-signal-hover">
            Open requests
          </Link>
        </div>
      ) : (
        <MeasureForm
          idempotencyKey={randomUUID().replace(/-/g, '')}
          spec={encoded}
          companies={companies}
          preselected={params.business ?? null}
          defaults={{
            name: session.name,
            email: session.email,
            phone,
            suburb: location?.suburb ?? '',
            state: location?.state ?? '',
            postcode: location?.postcode ?? '',
          }}
        />
      )}
    </div>
  )
}
