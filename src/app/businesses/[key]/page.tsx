import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { loadBusinessProfile } from '@/lib/business/profile'
import { formatRange } from '@/lib/business/coverage'
import { mediaUrl } from '@/lib/media'
import { businessCard, businessKeyFor, businessUserIds, decodeBusinessKey, encodeBusinessKey } from '@/lib/pricing/business'
import { productLabel } from '@/lib/pricing/products'
import { Badge } from '@/components/ui/Badge'
import { Stars } from '@/components/quotes/Stars'
import { ReviewReportButton } from './ReviewReportButton'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ from?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const key = decodeBusinessKey((await params).key)
  const card = key ? await businessCard(key) : null
  return { title: card?.name ?? 'Business' }
}

const SUB_RATINGS = [
  ['workmanship', 'Workmanship'],
  ['communication', 'Communication'],
  ['valueForMoney', 'Value'],
  ['punctuality', 'Punctuality'],
] as const

export default async function BusinessProfilePage({ params, searchParams }: Props) {
  const [{ key: rawKey }, { from }] = await Promise.all([params, searchParams])
  const key = decodeBusinessKey(rawKey)
  if (!key) notFound()
  const [profile, card, session] = await Promise.all([loadBusinessProfile(key), businessCard(key), getSession()])
  if (!profile || !card) notFound()

  // Only approved businesses are public. The business itself and admins can preview.
  const own = !!session && encodeBusinessKey(businessKeyFor(session)) === rawKey
  if (profile.status !== 'APPROVED' && !own && !(session && can(session.role, 'admin:settings'))) notFound()

  const userIds = await businessUserIds(key)
  const reviews = await prisma.workerReview.findMany({
    where: { workerId: { in: userIds }, status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { author: { select: { name: true } }, job: { select: { automatedQuote: { select: { product: true } } } } },
  })
  const detailAverages = SUB_RATINGS.map(([field, label]) => {
    const values = reviews.map((r) => r[field]).filter((v): v is number => typeof v === 'number')
    return { label, value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
  }).filter((d) => d.value !== null)
  const recommends = reviews.filter((r) => r.recommend !== null)
  const reviewPhotos = reviews.flatMap((r) => r.photoKeys).slice(0, 12)
  const backTo = from && /^DL-CMP-[0-9A-Z]{6,12}$/.test(from) ? `/compare/${from}` : null

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-10 sm:py-14">
      {backTo && (
        <Link href={backTo} className="mb-4 inline-block text-sm font-medium text-signal hover:text-signal-hover">
          ← Back to your quotes
        </Link>
      )}
      {profile.status !== 'APPROVED' && (
        <p className="mb-4 rounded-md border border-caution/30 bg-caution-tint px-3 py-2 text-sm text-graphite">
          Preview: customers can’t see this profile until Doorlink approves it.
        </p>
      )}

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-rail text-2xl font-semibold text-graphite">
          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.logoUrl} alt={`${card.name} logo`} className="size-full object-contain" />
          ) : (
            card.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-graphite">
            {card.name}
            {card.verified && <Badge tone="good">Licence &amp; insurance verified</Badge>}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Stars average={card.ratingAvg} count={card.ratingCount} />
            {card.jobsCompleted > 0 && <span className="text-sm text-zinc-deep">{card.jobsCompleted} jobs completed on Doorlink</span>}
          </div>
        </div>
        <Link
          href={backTo ?? '/configure'}
          className="inline-flex h-11 items-center justify-center rounded-md bg-signal px-5 text-sm font-semibold text-paper hover:bg-signal-hover"
        >
          {backTo ? 'Choose from your quotes' : 'Design and get a quote'}
        </Link>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {profile.description && (
            <section className="mb-8">
              <h2 className="mb-2 text-sm font-medium text-graphite">About</h2>
              <p className="whitespace-pre-line text-graphite-soft">{profile.description}</p>
            </section>
          )}

          {profile.portfolio.length > 0 && (
            <section className="mb-8" aria-labelledby="portfolio-heading">
              <h2 id="portfolio-heading" className="mb-3 text-sm font-medium text-graphite">
                Recent installations
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {profile.portfolio.map((item) => (
                  <li key={item.id} className="overflow-hidden rounded-lg border border-line bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(item.imageKey)!} alt={item.caption ?? 'Installation'} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    {item.caption && <p className="px-2 py-1.5 text-micro text-zinc-deep">{item.caption}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section id="reviews" aria-labelledby="reviews-heading" className="scroll-mt-24">
            <h2 id="reviews-heading" className="mb-1 text-sm font-medium text-graphite">
              Verified reviews
            </h2>
            <p className="mb-4 text-sm text-zinc-deep">
              Only customers whose job was booked and completed through Doorlink can review.
            </p>
            {detailAverages.length > 0 && (
              <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {detailAverages.map((d) => (
                  <div key={d.label} className="rounded-lg border border-line bg-paper p-3">
                    <dt className="text-micro text-zinc-deep">{d.label}</dt>
                    <dd className="text-lg font-semibold text-graphite">{d.value!.toFixed(1)}/5</dd>
                  </div>
                ))}
              </dl>
            )}
            {recommends.length > 0 && (
              <p className="mb-4 text-sm text-graphite">
                {Math.round((recommends.filter((r) => r.recommend).length / recommends.length) * 100)}% would recommend
                ({recommends.length} answered)
              </p>
            )}
            {reviewPhotos.length > 0 && (
              <ul className="mb-5 flex gap-2 overflow-x-auto" aria-label="Customer photos">
                {reviewPhotos.map((photo) => (
                  <li key={photo} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(photo)!} alt="Customer photo" className="size-24 rounded-md border border-line object-cover" loading="lazy" />
                  </li>
                ))}
              </ul>
            )}
            {reviews.length === 0 ? (
              <p className="rounded-lg border border-line bg-rail p-4 text-sm text-graphite-soft">No reviews yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {reviews.map((review) => (
                  <li key={review.id} className="rounded-lg border border-line bg-paper p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="text-caution" aria-label={`${review.rating} out of 5`}>
                          {'★'.repeat(review.rating)}
                          <span className="text-line">{'★'.repeat(5 - review.rating)}</span>
                        </span>
                        <Badge tone="good">Verified job</Badge>
                      </span>
                      <span className="text-micro text-zinc-deep">
                        {review.author.name.split(' ')[0]} ·{' '}
                        {review.createdAt.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                        {review.job.automatedQuote && ` · ${productLabel(review.job.automatedQuote.product)}`}
                        {review.editedAt && ' · edited'}
                      </span>
                    </div>
                    {review.body && <p className="mt-2 whitespace-pre-line text-sm text-graphite">{review.body}</p>}
                    {review.photoKeys.length > 0 && (
                      <ul className="mt-2 flex gap-2">
                        {review.photoKeys.map((photo) => (
                          <li key={photo}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(photo)!} alt="Job photo" className="size-20 rounded-md border border-line object-cover" loading="lazy" />
                          </li>
                        ))}
                      </ul>
                    )}
                    {review.workerReply && (
                      <div className="mt-3 rounded-md bg-rail px-3 py-2 text-sm">
                        <p className="text-micro font-medium text-zinc-deep">Reply from {card.name}</p>
                        <p className="mt-1 whitespace-pre-line text-graphite">{review.workerReply}</p>
                      </div>
                    )}
                    {session && <ReviewReportButton reviewId={review.id} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex h-fit flex-col gap-4 rounded-lg border border-line bg-paper p-4 text-sm shadow-panel">
          {profile.products.length > 0 && (
            <div>
              <h2 className="mb-1 font-medium text-graphite">Products</h2>
              <p className="text-graphite-soft">{profile.products.map(productLabel).join(', ')}</p>
            </div>
          )}
          {profile.serviceAreas.length > 0 && (
            <div>
              <h2 className="mb-1 font-medium text-graphite">Services postcodes</h2>
              <p className="text-graphite-soft">{profile.serviceAreas.map(formatRange).join(', ')}</p>
            </div>
          )}
          {profile.warranty && (
            <div>
              <h2 className="mb-1 font-medium text-graphite">Warranty</h2>
              <p className="text-graphite-soft">{profile.warranty}</p>
            </div>
          )}
          {profile.leadTimeDays !== null && (
            <div>
              <h2 className="mb-1 font-medium text-graphite">Availability</h2>
              <p className="text-graphite-soft">Usually installs within {profile.leadTimeDays} days of booking.</p>
            </div>
          )}
          <div>
            <h2 className="mb-1 font-medium text-graphite">Credentials</h2>
            <p className="text-graphite-soft">
              {card.verified
                ? 'Licence and insurance checked by Doorlink.'
                : 'Approved by Doorlink. Licence and insurance not yet checked by Doorlink.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
