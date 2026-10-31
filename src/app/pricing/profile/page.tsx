import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { canManageBusiness, ensureBusinessProfile } from '@/lib/business/profile'
import { formatRange } from '@/lib/business/coverage'
import { mediaUploadsAvailable, mediaUrl } from '@/lib/media'
import { businessKeyFor, encodeBusinessKey, pricingSession } from '@/lib/pricing/business'
import { AccessoriesForm, CoverageForm, PortfolioForm, ProfileForm } from './ProfileForms'
import { removePortfolioAction } from './actions'

// Per-account data: always rendered for the signed-in visitor, never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Business profile' }

function centsToDollars(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

export default async function BusinessProfilePage() {
  const session = await pricingSession(await getSession())
  if (!session) return null
  const key = businessKeyFor(session)
  const [profile, manage] = await Promise.all([ensureBusinessProfile(key), canManageBusiness(session, key)])

  if (!manage) {
    return (
      <p className="max-w-prose text-sm text-graphite-soft">
        Only the business owner can change the profile, service area and payments.
      </p>
    )
  }

  // One row per travel fee, so the form reads the way it was entered.
  const byFee = new Map<number, string[]>()
  for (const area of profile.serviceAreas) {
    byFee.set(area.travelFeeCents, [...(byFee.get(area.travelFeeCents) ?? []), formatRange(area)])
  }
  const coverage = [...byFee.entries()]
    .sort(([a], [b]) => a - b)
    .map(([fee, ranges]) => ({ text: ranges.join(', '), fee: fee === 0 ? '' : centsToDollars(fee) }))

  const accessories = Object.fromEntries(
    profile.accessories.map((a) => [a.accessory, { price: centsToDollars(a.priceCents), gst: a.gst }])
  )
  const section = 'rounded-lg border border-line bg-paper p-5 shadow-panel'

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={section} aria-labelledby="profile-heading">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="profile-heading" className="text-sm font-medium text-graphite">
            Public profile
          </h2>
          <Link
            href={`/businesses/${encodeBusinessKey(key)}`}
            className="text-sm font-medium text-signal hover:text-signal-hover"
          >
            View as a customer
          </Link>
        </div>
        <ProfileForm
          logoUrl={mediaUrl(profile.logoKey)}
          initial={{
            description: profile.description ?? '',
            warranty: profile.warranty ?? '',
            leadTimeDays: profile.leadTimeDays === null ? '' : String(profile.leadTimeDays),
            depositPercent: profile.depositPercent,
            products: profile.products,
          }}
        />
      </section>

      <div className="flex flex-col gap-6">
        <section className={section} aria-labelledby="coverage-heading">
          <h2 id="coverage-heading" className="mb-3 text-sm font-medium text-graphite">
            Service area
          </h2>
          <CoverageForm initial={coverage} />
        </section>

        <section className={section} aria-labelledby="accessories-heading">
          <h2 id="accessories-heading" className="mb-3 text-sm font-medium text-graphite">
            Accessory prices
          </h2>
          <AccessoriesForm initial={accessories} />
        </section>
      </div>

      <section className={`${section} lg:col-span-2`} aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading" className="mb-1 text-sm font-medium text-graphite">
          Portfolio
        </h2>
        <p className="mb-4 text-sm text-graphite-soft">Photos of installations you’ve finished. Shown on your profile.</p>
        {profile.portfolio.length > 0 && (
          <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {profile.portfolio.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(item.imageKey)!} alt={item.caption ?? 'Installation'} className="aspect-[4/3] w-full object-cover" />
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-micro text-zinc-deep">{item.caption}</span>
                  <form action={removePortfolioAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-micro font-medium text-bad hover:underline">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {mediaUploadsAvailable() ? (
          <PortfolioForm />
        ) : (
          <p className="text-sm text-zinc-deep">Photo uploads need file storage connected.</p>
        )}
      </section>
    </div>
  )
}
