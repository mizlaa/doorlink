import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { onboardingFor } from '@/lib/onboarding'
import { doorPreviewAvailable } from '@/lib/configurator/preview'
import { ensureWelcomeCredits, getCreditBalance } from '@/lib/credits/credits'
import { NotConnected } from '@/components/ui/NotConnected'
import { Badge } from '@/components/ui/Badge'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Account',
}

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  TECHNICIAN: 'Technician',
  SUPPLIER: 'Supplier',
  MANUFACTURER: 'Manufacturer',
  ADMIN: 'Admin',
}

// A single hub, not four speculative per-role dashboards — every account
// gets the same page, and it only ever shows counts against features that
// actually exist (listings, support, requests), linking through to the
// real pages rather than duplicating their content here.
export default async function AccountPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  const handlesLeads = can(session.role, 'lead:write:own') || can(session.role, 'lead:write:any')

  let data
  try {
    const [listingCount, activeListingCount, openTicketCount, claimedLeadCount, organization, user] =
      await Promise.all([
        prisma.listing.count({
          where: session.organizationId
            ? { organizationId: session.organizationId }
            : { sellerId: session.userId },
        }),
        prisma.listing.count({
          where: {
            status: 'ACTIVE',
            ...(session.organizationId
              ? { organizationId: session.organizationId }
              : { sellerId: session.userId }),
          },
        }),
        prisma.supportTicket.count({
          where: { userId: session.userId, status: { in: ['OPEN', 'PENDING'] } },
        }),
        handlesLeads
          ? prisma.lead.count({
              where: session.organizationId
                ? { assignedOrgId: session.organizationId }
                : { assignedUserId: session.userId },
            })
          : Promise.resolve(0),
        session.organizationId
          ? prisma.organization.findUnique({
              where: { id: session.organizationId },
              select: { name: true, type: true },
            })
          : Promise.resolve(null),
        prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { name: true, phone: true } }),
      ])
    data = { listingCount, activeListingCount, openTicketCount, claimedLeadCount, organization, user }
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Your account" reason="Can't load your account data right now." />
  }

  // Null when the database could not be read. The banner is simply absent
  // then — an unread checklist must not render as "nothing left to do".
  const onboarding = await onboardingFor(session)
  const setupRemaining = onboarding && !onboarding.complete ? onboarding.total - onboarding.done : 0

  let previewCredits: number | null = null
  if (doorPreviewAvailable()) {
    try {
      await ensureWelcomeCredits(session.userId)
      previewCredits = await getCreditBalance(session.userId)
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {setupRemaining > 0 && (
        <Link
          href="/welcome"
          className="flex flex-col gap-1 rounded-md border border-signal/40 bg-signal-tint px-5 py-4 transition-colors hover:border-signal"
        >
          <p className="text-sm font-medium text-graphite">
            {setupRemaining} thing{setupRemaining === 1 ? '' : 's'} left to set up
          </p>
          <p className="text-sm text-zinc-deep">{onboarding!.summary}</p>
          <p className="text-sm font-medium text-signal">
            Finish setting up<span aria-hidden="true"> →</span>
          </p>
        </Link>
      )}

      <div>
        <h1 className="text-xl font-semibold text-graphite">{data.user.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="signal">{ROLE_LABEL[session.role] ?? session.role}</Badge>
          {data.organization && <Badge tone="neutral">{data.organization.name}</Badge>}
        </div>
        <p className="mt-2 text-sm text-zinc-deep">{session.email}</p>
        {previewCredits !== null && (
          <p className="mt-3 text-sm text-graphite-soft">
            Photo preview credits:{' '}
            <span className="font-medium text-graphite">{previewCredits}</span>.{' '}
            <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
              Design a door
            </Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/my-listings"
          className="flex flex-col gap-1 rounded-md border border-line p-5 transition-colors hover:border-signal"
        >
          <p className="text-sm text-zinc-deep">Your listings</p>
          <p className="text-2xl font-semibold text-graphite">{data.listingCount}</p>
          <p className="text-micro text-zinc-deep">{data.activeListingCount} active</p>
        </Link>

        <Link
          href="/support"
          className="flex flex-col gap-1 rounded-md border border-line p-5 transition-colors hover:border-signal"
        >
          <p className="text-sm text-zinc-deep">Open support tickets</p>
          <p className="text-2xl font-semibold text-graphite">{data.openTicketCount}</p>
        </Link>

        {handlesLeads && (
          <Link
            href="/leads"
            className="flex flex-col gap-1 rounded-md border border-line p-5 transition-colors hover:border-signal"
          >
            <p className="text-sm text-zinc-deep">Requests you've claimed</p>
            <p className="text-2xl font-semibold text-graphite">{data.claimedLeadCount}</p>
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Contact details</h2>
        <ContactForm name={data.user.name} phone={data.user.phone} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Quick links</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/my-listings/new" className="font-medium text-signal hover:text-signal-hover">
            New listing
          </Link>
          <Link href="/support/new" className="font-medium text-signal hover:text-signal-hover">
            New support ticket
          </Link>
          <Link href="/welcome" className="font-medium text-signal hover:text-signal-hover">
            Getting started
          </Link>
          {handlesLeads && (
            <Link href="/leads" className="font-medium text-signal hover:text-signal-hover">
              View requests
            </Link>
          )}
          {can(session.role, 'catalogue:write') && (
            <Link href="/admin" className="font-medium text-signal hover:text-signal-hover">
              Admin
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
