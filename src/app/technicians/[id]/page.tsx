import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JobStatus, VerificationStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { formatWindow, groupByDay } from '@/lib/availability'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'

type PageProps = { params: Promise<{ id: string }> }

async function loadTechnician(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      technicianProfile: {
        include: {
          services: {
            include: { category: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
          serviceAreas: { orderBy: { postcode: 'asc' } },
          availability: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
          certifications: { orderBy: { createdAt: 'desc' } },
        },
      },
    },
  })
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  try {
    const user = await loadTechnician(id)
    const profile = user?.technicianProfile
    if (!user || !profile) return { title: 'Technician' }
    const name = profile.businessName || user.name
    return {
      title: name,
      description: profile.headline ?? `${name} on Doorlink.`,
      alternates: { canonical: `/technicians/${id}` },
    }
  } catch {
    return { title: 'Technician' }
  }
}

export default async function TechnicianProfilePage({ params }: PageProps) {
  const { id } = await params

  let user
  let reviews
  let completedJobs
  try {
    user = await loadTechnician(id)
    if (!user?.technicianProfile) notFound()
    ;[reviews, completedJobs] = await Promise.all([
      prisma.workerReview.findMany({
        where: { workerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          author: { select: { name: true } },
          job: { select: { lead: { select: { title: true, suburb: true } } } },
        },
      }),
      prisma.job.count({ where: { workerId: id, status: JobStatus.COMPLETED } }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="This profile" reason="Can't reach the database right now." />
      </div>
    )
  }

  const profile = user.technicianProfile!
  const displayName = profile.businessName || user.name
  const location = [profile.baseSuburb, profile.baseState].filter(Boolean).join(' ')
  const availabilityDays = groupByDay(profile.availability)
  const isVerified = profile.verificationStatus === VerificationStatus.VERIFIED

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-graphite">{displayName}</h1>
              {profile.headline && <p className="mt-1 text-graphite-soft">{profile.headline}</p>}
            </div>
            {/* Publicly there are only two states worth showing: Doorlink
                has checked this business, or it has not. "Documents
                submitted" and "In review" are the technician's business,
                and to a customer they read as almost-verified, which is
                exactly the impression they must not give. */}
            <Badge tone={isVerified ? 'good' : 'neutral'}>
              {isVerified ? 'Verified by Doorlink' : 'Not verified'}
            </Badge>
          </div>

          {/* What the badge above does and does not mean, in the one place
              a customer is deciding whether to trust it. */}
          <p className="mt-3 max-w-prose text-sm text-zinc-deep">
            {isVerified
              ? 'A Doorlink admin has matched the licence and insurance details this business supplied to their account. Doorlink is not a licensing authority and has not audited the issuer. Check anything that matters to you directly.'
              : 'Doorlink has not checked this business’s licence or insurance. Ask to see them before work starts.'}
          </p>

          {profile.bio && (
            <section className="mt-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">About</h2>
              <p className="max-w-prose whitespace-pre-wrap text-graphite-soft">{profile.bio}</p>
            </section>
          )}

          {profile.services.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Services</h2>
              <ul className="flex flex-col gap-2">
                {profile.services.map((service) => (
                  <li
                    key={service.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3"
                  >
                    <span className="text-sm font-medium text-graphite">{service.category.name}</span>
                    <span className="text-sm text-zinc-deep">
                      {service.fromPriceCents !== null
                        ? `from ${formatMoney(service.fromPriceCents)}`
                        : 'quoted per job'}
                      {service.note && ` · ${service.note}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {profile.certifications.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
                Certifications
              </h2>
              <ul className="flex flex-col gap-2">
                {profile.certifications.map((cert) => (
                  <li key={cert.id} className="rounded-md border border-line bg-paper px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-medium text-graphite">{cert.name}</span>
                      {/* Two badges that mean genuinely different things:
                          "checked" is an admin having looked, "stated by
                          the technician" is an unverified claim. */}
                      <Badge tone={cert.verified ? 'good' : 'neutral'}>
                        {cert.verified ? 'Checked by Doorlink' : 'Stated by the technician'}
                      </Badge>
                    </div>
                    {(cert.issuer || cert.expiresAt) && (
                      <p className="mt-1 text-micro text-zinc-deep">
                        {[
                          cert.issuer,
                          cert.expiresAt &&
                            `expires ${cert.expiresAt.toLocaleDateString('en-AU', {
                              timeZone: 'Australia/Sydney',
                              month: 'short',
                              year: 'numeric',
                            })}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
              Reviews ({profile.ratingCount})
            </h2>
            {reviews.length === 0 ? (
              <EmptyState
                title="No reviews yet"
                description="Reviews can only be left by a customer whose job reached completion on Doorlink."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {reviews.map((review) => (
                  <li key={review.id} className="rounded-md border border-line bg-paper p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-medium text-graphite">
                        <span aria-hidden="true">{'★'.repeat(review.rating)}</span>
                        <span className="sr-only">{review.rating} out of 5</span>
                        <span className="ml-2 font-normal text-zinc-deep">{review.author.name}</span>
                      </span>
                      <span className="text-micro text-zinc-deep">
                        {review.job.lead?.suburb && `${review.job.lead.suburb} · `}
                        {review.createdAt.toLocaleDateString('en-AU', {
                          timeZone: 'Australia/Sydney',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {review.body && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-graphite-soft">{review.body}</p>
                    )}
                    {review.workerReply && (
                      <p className="mt-3 border-l-2 border-line pl-3 text-sm text-graphite-soft">
                        <span className="font-medium text-graphite">{displayName} replied: </span>
                        {review.workerReply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:w-72 lg:shrink-0">
          <dl className="rounded-md border border-line bg-paper p-4 text-sm">
            <Row
              label="Rating"
              value={
                profile.ratingCount > 0
                  ? `${profile.ratingAvg?.toFixed(1)} ★ from ${profile.ratingCount} ${profile.ratingCount === 1 ? 'review' : 'reviews'}`
                  : 'No reviews yet'
              }
            />
            <Row label="Jobs completed" value={String(completedJobs)} />
            {profile.yearsExperience !== null && (
              <Row label="Years in the trade" value={String(profile.yearsExperience)} />
            )}
            {location && <Row label="Based in" value={location} />}
            <Row label="Taking work" value={profile.acceptingWork ? 'Yes' : 'Not at the moment'} />
          </dl>

          {profile.serviceAreas.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
                Areas covered
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {profile.serviceAreas.map((area) => (
                  <li
                    key={area.id}
                    className="rounded border border-line bg-paper px-2 py-1 font-code text-micro text-graphite"
                  >
                    {[area.suburb, area.postcode].filter(Boolean).join(' ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.availability.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Usual hours</h2>
              <dl className="flex flex-col gap-1 text-sm">
                {availabilityDays
                  .filter((day) => day.windows.length > 0)
                  .map((day) => (
                    <div key={day.dayOfWeek} className="flex gap-3">
                      <dt className="w-12 shrink-0 text-zinc-deep">{day.shortLabel}</dt>
                      <dd className="text-graphite">
                        {day.windows.map((window) => formatWindow(window)).join(', ')}
                      </dd>
                    </div>
                  ))}
              </dl>
              {/* Said explicitly: this is what the technician wrote down,
                  not a diary Doorlink can see. Rendering hours without
                  this line invites a customer to read an empty slot as a
                  free slot. */}
              <p className="mt-2 text-micro text-zinc-deep">
                Stated by the technician. Doorlink is not connected to their calendar, so this is not live
                availability.
              </p>
            </div>
          )}

          {/* No "contact" button. Contact details on Doorlink are
              exchanged when a job is agreed, not browsed. */}
          <div className="mt-6 rounded-md border border-line bg-rail p-4 text-sm text-graphite-soft">
            Contact details are exchanged once you hire someone.{' '}
            <Link href="/request-technician" className="font-medium text-signal hover:text-signal-hover">
              Post your job
            </Link>{' '}
            and technicians covering your area can quote on it.
          </div>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0 last:pb-0 first:pt-0">
      <dt className="text-zinc-deep">{label}</dt>
      <dd className="text-right text-graphite">{value}</dd>
    </div>
  )
}
