import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VerificationStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import {
  canSubmitForVerification,
  canWithdrawVerification,
  ensureTechnicianProfile,
  missingForVerification,
  profileGaps,
} from '@/lib/technician'
import { NotConnected } from '@/components/ui/NotConnected'
import { Badge } from '@/components/ui/Badge'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { VERIFICATION_LABELS, VERIFICATION_TONE } from '@/lib/labels'
import {
  AvailabilityEditor,
  BaseForm,
  CertificationEditor,
  CredentialsForm,
  DetailsForm,
  ServiceAreaEditor,
  ServiceEditor,
  VerificationControls,
} from './ProfileForms'

export const metadata: Metadata = { title: 'Your trade profile' }

// What each verification state actually means, said plainly. The brief is
// explicit that nothing may imply a legal check that has not happened,
// and "Verified by Doorlink" is exactly the kind of badge people read as
// more than it is — so the page says what was checked and by whom.
const VERIFICATION_EXPLANATION: Record<VerificationStatus, string> = {
  UNVERIFIED:
    'Nobody at Doorlink has checked your licence or insurance. Customers see your profile marked "not verified".',
  SUBMITTED:
    'Your details are queued for a Doorlink admin to look at. Nothing has been checked yet, and your profile still shows as unverified until it has.',
  IN_REVIEW: 'A Doorlink admin is going through your details now.',
  VERIFIED:
    'A Doorlink admin has looked at the licence and insurance details you supplied and matched them to your account. That is what the badge means. Doorlink is not a licensing authority and has not audited the issuer.',
  REJECTED:
    'A Doorlink admin could not match the details you supplied. You can correct them and send them again.',
}

export default async function MyProfilePage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'marketplace:quote')) redirect('/account')

  const tradeAccess = await tradeSubscriptionAccess(session)
  if (!tradeAccess.allowed) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <TradeSubscriptionPaywall />
      </div>
    )
  }

  let profile
  let categories
  try {
    const base = await ensureTechnicianProfile(session.userId)
    ;[profile, categories] = await Promise.all([
      prisma.technicianProfile.findUniqueOrThrow({
        where: { id: base.id },
        include: {
          services: {
            include: { category: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
          serviceAreas: { orderBy: { postcode: 'asc' } },
          availability: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
          certifications: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.serviceCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Your trade profile" reason="Can't reach the database right now." />
      </div>
    )
  }

  const gaps = profileGaps({
    businessName: profile.businessName,
    headline: profile.headline,
    bio: profile.bio,
    businessPhone: profile.businessPhone,
    baseSuburb: profile.baseSuburb,
    serviceCount: profile.services.length,
    areaCount: profile.serviceAreas.length,
  })
  const missing = missingForVerification(profile)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Your trade profile</h1>
        <p className="mt-1 text-graphite-soft">
          What customers see when they are comparing your quote against someone else&apos;s.{' '}
          <Link
            href={`/technicians/${session.userId}`}
            className="font-medium text-signal hover:text-signal-hover"
          >
            View it as a customer
          </Link>
          .
        </p>
      </header>

      {gaps.length > 0 && (
        <div className="mb-10 rounded-md border border-caution/30 bg-caution-tint p-4">
          <p className="text-sm font-medium text-caution">Still to fill in</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-graphite">
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      <Section id="about" title="About you">
        <DetailsForm profile={profile} />
      </Section>

      <Section title="Where you are based">
        <BaseForm profile={profile} />
      </Section>

      <Section
        id="areas"
        title="Postcodes you cover"
        description="Jobs are matched on these, not on the radius above. Add every postcode you would actually drive to."
      >
        <ServiceAreaEditor areas={profile.serviceAreas} />
      </Section>

      <Section id="services" title="What you do">
        <ServiceEditor services={profile.services} categories={categories} />
      </Section>

      <Section title="Licence and insurance">
        <CredentialsForm profile={profile} />
      </Section>

      <Section
        id="availability"
        title="Hours you normally work"
        description="Shown on your profile so a customer knows when to expect you. Doorlink has no calendar connected. Nothing here books or blocks anything, and a job can still be scheduled outside these hours if you agree to it."
      >
        <AvailabilityEditor availability={profile.availability} />
      </Section>

      <Section id="verification" title="Verification">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={VERIFICATION_TONE[profile.verificationStatus]}>
              {VERIFICATION_LABELS[profile.verificationStatus]}
            </Badge>
          </div>

          <p className="max-w-prose text-sm text-graphite-soft">
            {VERIFICATION_EXPLANATION[profile.verificationStatus]}
          </p>

          {profile.verificationNote && (
            <p className="rounded-md border border-line bg-rail p-3 text-sm text-graphite">
              <span className="font-medium">Note from Doorlink: </span>
              {profile.verificationNote}
            </p>
          )}

          {canSubmitForVerification(profile.verificationStatus) &&
            (missing.length > 0 ? (
              <p className="text-sm text-graphite-soft">Before you can submit, add {missing.join(', ')}.</p>
            ) : (
              <VerificationControls mode="submit" />
            ))}

          {canWithdrawVerification(profile.verificationStatus) && <VerificationControls mode="withdraw" />}
        </div>
      </Section>

      <Section
        title="Certifications"
        description="Anything you have been trained or accredited on. Listed as your claim until a Doorlink admin has checked it."
      >
        <CertificationEditor certifications={profile.certifications} />
      </Section>
    </div>
  )
}

function Section({
  id,
  title,
  description,
  children,
}: {
  // The getting-started checklist links straight at a section, so these
  // ids are part of an interface, not decoration — renaming one breaks a
  // link in src/lib/onboarding.ts.
  id?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="mb-10 scroll-mt-24 border-t border-line pt-8 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <h2 className="text-lg font-semibold text-graphite">{title}</h2>
      {description && <p className="mt-1 max-w-prose text-sm text-graphite-soft">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}
