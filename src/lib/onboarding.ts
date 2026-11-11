import 'server-only'

import { ListingStatus, Role, VerificationStatus } from '@prisma/client'
import type { Session } from './auth'
import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'

/**
 * What a new account still has to do before Doorlink is any use to them.
 *
 * The important decision here is that **nothing is stored**. There is no
 * `onboardingStep` column, no `hasCompletedSetup` flag, no dismissed-at
 * timestamp. Every tick on this list is a query run now against the thing
 * it claims to be about: "you have posted a job" is a count of that
 * person's leads, "you have listed a part" is a count of their active
 * listings.
 *
 * A stored flag is the usual way these go wrong. It gets set optimistically
 * at the end of a wizard, the write it was meant to represent fails, and
 * the account is left with a green tick over an empty profile — the
 * checklist quietly becomes a claim nobody checked. Counting is slower and
 * it is honest, and at this scale slower does not matter.
 *
 * The consequence to keep in mind when editing: a step can go from done
 * back to not-done. Delete your last listing and the listing step unticks.
 * That is correct. The list describes the account as it is, not a path the
 * account once walked.
 */

export interface OnboardingStep {
  key: string
  title: string
  /** What doing this gets them. Not a restatement of the title. */
  description: string
  href: string
  cta: string
  done: boolean
  /**
   * Steps nobody has to do. They still appear, because "you could also
   * do this" is useful, but they do not count toward the total and they
   * never make the account look unfinished.
   */
  optional?: boolean
  /**
   * Set when the step is genuinely not the account holder's to complete —
   * verification, catalogue linking. The UI must not render these as
   * something they are failing to do.
   */
  waitingOnDoorlink?: boolean
}

export interface Onboarding {
  role: Role
  /** A one-line answer to "what is this account for". */
  summary: string
  steps: OnboardingStep[]
  /** Required steps done, and how many there are. Excludes optional. */
  done: number
  total: number
  /** True once every required step is done. */
  complete: boolean
}

/**
 * Null means the database could not be read. The page renders that as
 * unavailable rather than as an empty checklist, which would read as
 * "nothing left to do".
 */
export async function onboardingFor(session: Session): Promise<Onboarding | null> {
  try {
    const steps = await stepsFor(session)
    const required = steps.filter((step) => !step.optional && !step.waitingOnDoorlink)
    const done = required.filter((step) => step.done).length

    return {
      role: session.role,
      summary: SUMMARY[session.role],
      steps,
      done,
      total: required.length,
      complete: done === required.length,
    }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return null
    throw error
  }
}

const SUMMARY: Record<Role, string> = {
  CUSTOMER:
    'Describe the door or gate that needs work, and technicians who cover your postcode send you quotes.',
  TECHNICIAN:
    'Fill in your trade profile and pick the postcodes you cover, and matching jobs show up in your leads.',
  SUPPLIER: 'List the parts you have, and people searching for that model find them.',
  MANUFACTURER:
    'Your products and manuals live in the Doorlink catalogue. Getting your organization linked to a catalogue entry is an admin step, not a self-serve one.',
  ADMIN: 'Run the catalogue, the verification queue, disputes and the commission rate.',
}

// ---------------------------------------------------------------------

async function stepsFor(session: Session): Promise<OnboardingStep[]> {
  switch (session.role) {
    case Role.CUSTOMER:
      return customerSteps(session)
    case Role.TECHNICIAN:
      return technicianSteps(session)
    case Role.SUPPLIER:
      return supplierSteps(session)
    case Role.MANUFACTURER:
      return manufacturerSteps(session)
    case Role.ADMIN:
      return adminSteps()
  }
}

async function customerSteps(session: Session): Promise<OnboardingStep[]> {
  const [user, leadCount, hiredCount, savedCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { phone: true } }),
    prisma.lead.count({ where: { customerId: session.userId } }),
    prisma.job.count({ where: { customerId: session.userId } }),
    prisma.savedManual.count({ where: { userId: session.userId } }),
  ])

  return [
    {
      key: 'contact',
      title: 'Add a contact number',
      description:
        'A technician you hire needs a way to reach you. It stays hidden until you accept a quote — nobody browsing sees it.',
      href: '/account',
      cta: 'Add your number',
      done: Boolean(user?.phone),
    },
    {
      key: 'lead',
      title: 'Post what needs doing',
      description:
        'A photo and a sentence is enough. Technicians covering your postcode can quote on it; you pick one, or none.',
      href: '/request-technician',
      cta: 'Post a job',
      done: leadCount > 0,
    },
    {
      key: 'hire',
      title: 'Accept a quote',
      description:
        'Accepting turns a quote into a job with an agreed price, and only then do you and the technician get each other’s contact details.',
      href: '/my-requests',
      cta: 'See your quotes',
      done: hiredCount > 0,
      optional: true,
    },
    {
      key: 'manual',
      title: 'Save the manual for your door',
      description:
        'Find your model once and the manual stays on your account — useful the next time something needs a part number.',
      href: '/manuals',
      cta: 'Search manuals',
      done: savedCount > 0,
      optional: true,
    },
  ]
}

/** Brand and invoicing: a logo and the GST/terms settings saved once. */
async function brandStep(session: Session): Promise<OnboardingStep> {
  const businessKey = session.organizationId ? `o_${session.organizationId}` : `u_${session.userId}`
  const profile = await prisma.businessProfile.findUnique({ where: { businessKey }, select: { id: true, logoVersionId: true } })
  const settings = profile ? await prisma.auditLog.count({ where: { action: 'business.settings.update', entityId: profile.id } }) : 0
  return {
    key: 'brand',
    title: 'Set up your brand and invoicing',
    description: 'Your logo (upload one or create one free), GST status and payment terms. They go on your profile, quotes, invoices and receipts.',
    href: '/business/setup',
    cta: 'Set up brand',
    done: !!profile?.logoVersionId && settings > 0,
  }
}

async function technicianSteps(session: Session): Promise<OnboardingStep[]> {
  const profile = await prisma.technicianProfile.findUnique({
    where: { userId: session.userId },
    include: {
      _count: { select: { services: true, serviceAreas: true, availability: true } },
    },
  })

  const quoteCount = await prisma.quote.count({ where: { workerId: session.userId } })

  const verification = profile?.verificationStatus ?? VerificationStatus.UNVERIFIED
  const submitted =
    verification !== VerificationStatus.UNVERIFIED && verification !== VerificationStatus.REJECTED

  return [
    {
      key: 'profile',
      title: 'Fill in your trade profile',
      description:
        'Your business name, a contact number and a line about what you do. This is what a customer reads when they are comparing three quotes.',
      href: '/my-profile',
      cta: 'Edit profile',
      done: Boolean(profile?.businessName && profile?.businessPhone && profile?.headline),
    },
    {
      key: 'services',
      title: 'Choose the services you offer',
      description:
        'Doorlink only shows you leads in the categories you pick. Leave this empty and you see nothing.',
      href: '/my-profile#services',
      cta: 'Pick services',
      done: (profile?._count.services ?? 0) > 0,
    },
    {
      key: 'areas',
      title: 'Add the postcodes you cover',
      description:
        'Matching is by postcode. A job in a postcode you have not listed will not reach you, however close it is.',
      href: '/my-profile#areas',
      cta: 'Add postcodes',
      done: (profile?._count.serviceAreas ?? 0) > 0,
    },
    await brandStep(session),
    {
      key: 'availability',
      title: 'Set the hours you work',
      description:
        'Customers see when you are normally available before they ask you to book something. Optional, and you can change it any time.',
      href: '/my-profile#availability',
      cta: 'Set hours',
      done: (profile?._count.availability ?? 0) > 0,
      optional: true,
    },
    {
      key: 'verification',
      title: 'Send your licence in for checking',
      description:
        'A Doorlink admin matches the licence and ABN you supply to your account. Until one has, your profile says "not verified" — you can still quote and win work.',
      href: '/my-profile#verification',
      cta: submitted ? 'See status' : 'Submit details',
      done: verification === VerificationStatus.VERIFIED,
      waitingOnDoorlink: submitted && verification !== VerificationStatus.VERIFIED,
    },
    {
      key: 'quote',
      title: 'Quote on your first job',
      description:
        'You see the job and the suburb. The customer’s address and number arrive if they accept your quote.',
      href: '/leads',
      cta: 'Browse leads',
      done: quoteCount > 0,
    },
  ]
}

async function supplierSteps(session: Session): Promise<OnboardingStep[]> {
  const listingWhere = session.organizationId
    ? { organizationId: session.organizationId }
    : { sellerId: session.userId }

  const [user, listingCount, activeCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { phone: true } }),
    prisma.listing.count({ where: listingWhere }),
    prisma.listing.count({ where: { ...listingWhere, status: ListingStatus.ACTIVE } }),
  ])

  return [
    {
      key: 'contact',
      title: 'Add a contact number',
      description: 'Shown to a buyer once they ask about one of your listings, not before.',
      href: '/account',
      cta: 'Add your number',
      done: Boolean(user?.phone),
    },
    {
      key: 'listing',
      title: 'List your first part',
      description:
        'Attach it to the model it fits and it turns up when somebody searches that model — not just when they search your shop.',
      href: '/my-listings/new',
      cta: 'Create a listing',
      done: listingCount > 0,
    },
    {
      key: 'active',
      title: 'Publish a listing',
      description:
        'A draft is not searchable. Publishing is what puts it in front of people looking for that part.',
      href: '/my-listings',
      cta: 'Review listings',
      done: activeCount > 0,
    },
  ]
}

async function manufacturerSteps(session: Session): Promise<OnboardingStep[]> {
  const organization = session.organizationId
    ? await prisma.organization.findUnique({
        where: { id: session.organizationId },
        // The catalogue link is a Manufacturer row pointing back at this
        // organization, not a column here — so a self-registered business
        // cannot set it on itself.
        select: { id: true, name: true, manufacturer: { select: { id: true, name: true } } },
      })
    : null

  return [
    {
      key: 'organization',
      title: 'Your organization account',
      description: organization
        ? `Registered as ${organization.name}.`
        : 'No organization is attached to this account yet.',
      href: '/account',
      cta: 'View account',
      done: Boolean(organization),
    },
    {
      key: 'catalogue-link',
      title: 'Get linked to your catalogue entry',
      description: organization?.manufacturer
        ? `Linked to ${organization.manufacturer.name} in the Doorlink catalogue.`
        : 'Registering does not make this account the owner of a catalogue manufacturer — an admin has to match the two, otherwise anyone could claim a brand. Until that happens you have read access to the catalogue like everyone else.',
      href: '/support',
      cta: 'Ask an admin',
      done: Boolean(organization?.manufacturer),
      waitingOnDoorlink: Boolean(organization) && !organization?.manufacturer,
    },
    {
      key: 'browse',
      title: 'Check what Doorlink already holds for you',
      description:
        'Manuals and models under your brand may already be in the catalogue. Worth seeing what is there, and what revision it is.',
      href: '/manuals',
      cta: 'Search the catalogue',
      done: false,
      optional: true,
    },
  ]
}

async function adminSteps(): Promise<OnboardingStep[]> {
  const [pendingVerifications, openDisputes, openReports] = await Promise.all([
    prisma.technicianProfile.count({
      where: { verificationStatus: { in: [VerificationStatus.SUBMITTED, VerificationStatus.IN_REVIEW] } },
    }),
    prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.report.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
  ])

  // An admin has no setup to do, so this is a work queue rather than a
  // checklist — the counts are the point, and "done" means the queue is
  // empty right now, not that anything was completed once.
  return [
    {
      key: 'verifications',
      title:
        pendingVerifications === 0
          ? 'No technicians waiting on verification'
          : `${pendingVerifications} technician${pendingVerifications === 1 ? '' : 's'} waiting on verification`,
      description:
        'Nobody gets a verified badge without a person here matching their licence to their account.',
      href: '/admin/verification',
      cta: 'Open the queue',
      done: pendingVerifications === 0,
    },
    {
      key: 'disputes',
      title:
        openDisputes === 0
          ? 'No open disputes'
          : `${openDisputes} open dispute${openDisputes === 1 ? '' : 's'}`,
      description: 'A job in dispute cannot move until an admin decides what happens to it.',
      href: '/admin/disputes',
      cta: 'Open disputes',
      done: openDisputes === 0,
    },
    {
      key: 'reports',
      title:
        openReports === 0 ? 'No open reports' : `${openReports} open report${openReports === 1 ? '' : 's'}`,
      description: 'Reports about listings, profiles and messages land here.',
      href: '/admin/reports',
      cta: 'Open reports',
      done: openReports === 0,
    },
  ]
}
