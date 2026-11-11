import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VerificationStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { VERIFICATION_LABELS, VERIFICATION_TONE } from '@/lib/labels'
import { DecisionForm } from './DecisionForm'

export const metadata: Metadata = { title: 'Verification' }

const QUEUE: VerificationStatus[] = [VerificationStatus.SUBMITTED, VerificationStatus.IN_REVIEW]

export default async function AdminVerificationPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  let queue
  let decided
  try {
    ;[queue, decided] = await Promise.all([
      prisma.technicianProfile.findMany({
        where: { verificationStatus: { in: QUEUE } },
        orderBy: { updatedAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          certifications: { orderBy: { createdAt: 'desc' } },
          _count: { select: { services: true, serviceAreas: true } },
        },
      }),
      prisma.technicianProfile.findMany({
        where: { verificationStatus: { in: [VerificationStatus.VERIFIED, VerificationStatus.REJECTED] } },
        orderBy: { updatedAt: 'desc' },
        take: 15,
        include: { user: { select: { id: true, name: true } } },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Verification" reason="Can't reach the database right now." />
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">Waiting for review ({queue.length})</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Verifying a business is a claim Doorlink makes to customers about someone&apos;s credentials. There is
          no verification service connected and nothing here is checked automatically. Read the licence and
          insurance details, satisfy yourself they belong to this account, and only then verify. If you cannot,
          reject it and say why.
        </p>

        <div className="mt-5">
          {queue.length === 0 ? (
            <EmptyState title="Nothing waiting" description="No technician has asked to be verified." />
          ) : (
            <ul className="flex flex-col gap-4">
              {queue.map((profile) => (
                <li key={profile.id} className="rounded-md border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">
                        <Link
                          href={`/technicians/${profile.user.id}`}
                          className="text-signal hover:text-signal-hover"
                        >
                          {profile.businessName || profile.user.name}
                        </Link>
                      </p>
                      <p className="mt-0.5 text-micro text-zinc-deep">
                        {profile.user.name} · {profile.user.email}
                        {(profile.businessPhone || profile.user.phone) &&
                          ` · ${profile.businessPhone ?? profile.user.phone}`}
                      </p>
                    </div>
                    <Badge tone={VERIFICATION_TONE[profile.verificationStatus]}>
                      {VERIFICATION_LABELS[profile.verificationStatus]}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Detail label="ABN" value={profile.abn} />
                    <Detail label="Licence number" value={profile.licenceNumber} />
                    <Detail label="Insurer" value={profile.insurerName} />
                    <Detail label="Policy number" value={profile.insurancePolicyNumber} />
                    <Detail
                      label="Insurance expires"
                      value={
                        profile.insuranceExpiresAt
                          ? profile.insuranceExpiresAt.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium' })
                          : null
                      }
                    />
                    <Detail
                      label="Based in"
                      value={[profile.baseSuburb, profile.baseState, profile.basePostcode]
                        .filter(Boolean)
                        .join(' ')}
                    />
                    <Detail label="Services listed" value={String(profile._count.services)} />
                    <Detail label="Postcodes covered" value={String(profile._count.serviceAreas)} />
                  </dl>

                  {profile.certifications.length > 0 && (
                    <div className="mt-4">
                      <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">
                        Certifications claimed
                      </p>
                      <ul className="mt-1 flex flex-col gap-0.5 text-sm text-graphite-soft">
                        {profile.certifications.map((cert) => (
                          <li key={cert.id}>
                            {cert.name}
                            {cert.issuer && ` | ${cert.issuer}`}
                            {cert.reference && ` (${cert.reference})`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-5 border-t border-line pt-4">
                    <DecisionForm profileId={profile.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Recently decided</h2>
        <div className="mt-4">
          {decided.length === 0 ? (
            <EmptyState title="No decisions yet" />
          ) : (
            <ul className="flex flex-col gap-2">
              {decided.map((profile) => (
                <li
                  key={profile.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
                >
                  <Link
                    href={`/technicians/${profile.user.id}`}
                    className="font-medium text-signal hover:text-signal-hover"
                  >
                    {profile.businessName || profile.user.name}
                  </Link>
                  <span className="flex items-center gap-3">
                    {profile.verificationNote && (
                      <span className="text-micro text-zinc-deep">{profile.verificationNote}</span>
                    )}
                    <Badge tone={VERIFICATION_TONE[profile.verificationStatus]}>
                      {VERIFICATION_LABELS[profile.verificationStatus]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-1">
      <dt className="text-zinc-deep">{label}</dt>
      {/* An absent value is stated as absent rather than left blank —
          "not supplied" is information an admin needs when deciding. */}
      <dd className={value ? 'text-right font-code text-graphite' : 'text-right text-zinc'}>
        {value || 'not supplied'}
      </dd>
    </div>
  )
}
