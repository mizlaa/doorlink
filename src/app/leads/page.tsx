import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LeadStatus, QuoteStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { currentCommissionBps } from '@/lib/commission-settings'
import { matchLead, QUOTABLE_LEAD_STATUSES } from '@/lib/marketplace'
import { formatBudgetRange, formatMoney } from '@/lib/money'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONE,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONE,
  URGENCY_LABELS,
  URGENCY_TONE,
} from '@/lib/labels'
import { QuoteForm } from './QuoteForm'
import { OpenConversationButton } from '@/app/messages/OpenConversation'

export const metadata: Metadata = {
  title: 'Job board',
}

export default async function JobBoardPage() {
  const session = await getSession()
  if (!session || !can(session.role, 'marketplace:quote')) redirect('/')

  const tradeAccess = await tradeSubscriptionAccess(session)
  if (!tradeAccess.allowed) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <TradeSubscriptionPaywall />
      </div>
    )
  }

  let openLeads
  let myQuotes
  let commissionRateBps
  let profile
  try {
    ;[openLeads, myQuotes, commissionRateBps, profile] = await Promise.all([
      prisma.lead.findMany({
        where: {
          status: { in: QUOTABLE_LEAD_STATUSES },
          // A technician never sees their own request on the board they
          // quote from.
          NOT: { customerId: session.userId },
        },
        orderBy: [{ urgency: 'asc' }, { createdAt: 'desc' }],
        include: {
          serviceCategory: { select: { id: true, name: true } },
          model: { select: { name: true, modelCode: true } },
          _count: { select: { quotes: true } },
          quotes: {
            where: { workerId: session.userId },
            select: { id: true, amountCents: true, message: true, status: true },
          },
        },
        take: 50,
      }),
      prisma.quote.findMany({
        where: { workerId: session.userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              reference: true,
              title: true,
              message: true,
              status: true,
              suburb: true,
              state: true,
            },
          },
        },
        take: 50,
      }),
      currentCommissionBps(),
      prisma.technicianProfile.findUnique({
        where: { userId: session.userId },
        select: {
          serviceAreas: { select: { postcode: true } },
          services: { select: { categoryId: true } },
        },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="The job board" reason="Can't reach the database right now." />
  }

  // Matching is set membership against what this technician typed into
  // their own profile, so the board can put the jobs they actually want
  // at the top. Nothing is hidden: every open job is still on the page,
  // and the reason a job is ranked where it is, is spelled out on it.
  const matcher =
    profile && (profile.serviceAreas.length > 0 || profile.services.length > 0)
      ? {
          postcodes: new Set(profile.serviceAreas.map((a) => a.postcode)),
          categoryIds: new Set(profile.services.map((s) => s.categoryId)),
        }
      : null

  const matchedLeads = openLeads
    .map((lead) => ({
      lead,
      match: matchLead({ postcode: lead.postcode, serviceCategoryId: lead.serviceCategoryId }, matcher),
    }))
    .sort((a, b) => b.match.score - a.match.score)

  const matchingCount = matchedLeads.filter((entry) => entry.match.score > 0).length

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-xl font-semibold text-graphite">Job board</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-deep">
          Open requests from customers. Send a quote to be considered. The customer chooses who to hire, and
          only then do you exchange contact details.
        </p>
        {matcher ? (
          matchingCount > 0 && (
            <p className="mt-2 max-w-prose text-sm text-graphite-soft">
              {matchingCount} of these {matchingCount === 1 ? 'is' : 'are'} in a postcode you cover or a service
              you offer, and {matchingCount === 1 ? 'is' : 'are'} listed first.
            </p>
          )
        ) : (
          <p className="mt-2 max-w-prose text-sm text-graphite-soft">
            <Link href="/my-profile" className="font-medium text-signal hover:text-signal-hover">
              Add your postcodes and services
            </Link>{' '}
            and the jobs you actually want will be listed first.
          </p>
        )}
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">
          Open jobs ({openLeads.length})
        </h2>

        {openLeads.length === 0 ? (
          <EmptyState
            title="No open jobs right now"
            description="New customer requests will appear here as they're posted."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {matchedLeads.map(({ lead, match }) => {
              const mine = lead.quotes[0]
              const budget = formatBudgetRange(lead.budgetMinCents, lead.budgetMaxCents)
              const location = [lead.suburb, lead.state, lead.postcode].filter(Boolean).join(' ')

              return (
                <li key={lead.id} className="rounded-md border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">{lead.title ?? lead.message.slice(0, 80)}</p>
                      <p className="mt-1 font-code text-micro text-zinc-deep">{lead.reference}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {match.reasons.length > 0 && <Badge tone="signal">{match.reasons.join(' · ')}</Badge>}
                      <Badge tone={URGENCY_TONE[lead.urgency]}>{URGENCY_LABELS[lead.urgency]}</Badge>
                      <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm text-graphite-soft">{lead.message}</p>

                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-deep">
                    {lead.serviceCategory && (
                      <div>
                        <dt className="inline font-medium text-graphite-soft">Service: </dt>
                        <dd className="inline">{lead.serviceCategory.name}</dd>
                      </div>
                    )}
                    {location && (
                      <div>
                        <dt className="inline font-medium text-graphite-soft">Location: </dt>
                        <dd className="inline">{location}</dd>
                      </div>
                    )}
                    {budget && (
                      <div>
                        <dt className="inline font-medium text-graphite-soft">Budget: </dt>
                        <dd className="inline">{budget}</dd>
                      </div>
                    )}
                    {lead.preferredTiming && (
                      <div>
                        <dt className="inline font-medium text-graphite-soft">Prefers: </dt>
                        <dd className="inline">{lead.preferredTiming}</dd>
                      </div>
                    )}
                    {lead.model && (
                      <div>
                        <dt className="inline font-medium text-graphite-soft">Product: </dt>
                        <dd className="inline font-code">{lead.model.modelCode}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline font-medium text-graphite-soft">Quotes so far: </dt>
                      <dd className="inline">{lead._count.quotes}</dd>
                    </div>
                  </dl>

                  {/* Contact details are deliberately absent until the
                      customer accepts a quote, the board shows the work,
                      not the person. */}
                  <details className="mt-4 border-t border-line pt-4" open={Boolean(mine)}>
                    <summary className="cursor-pointer text-sm font-medium text-signal hover:text-signal-hover">
                      {mine ? `Your quote: ${formatMoney(mine.amountCents)} | edit` : 'Send a quote'}
                    </summary>
                    <div className="mt-4">
                      <QuoteForm
                        leadId={lead.id}
                        commissionRateBps={commissionRateBps}
                        existing={mine ? { amountCents: mine.amountCents, message: mine.message } : null}
                      />
                    </div>
                  </details>

                  {/* Only once you have quoted. Otherwise the board is a
                      way to message every customer on the platform. */}
                  {mine && (
                    <div className="mt-4">
                      <OpenConversationButton leadId={lead.id} label="Ask the customer a question" />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">
          Your quotes ({myQuotes.length})
        </h2>

        {myQuotes.length === 0 ? (
          <EmptyState title="You haven't quoted on anything yet" />
        ) : (
          <ul className="flex flex-col gap-3">
            {myQuotes.map((quote) => (
              <li key={quote.id} className="rounded-md border border-line bg-paper p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-graphite">
                      {quote.lead.title ?? quote.lead.message.slice(0, 80)}
                    </p>
                    <p className="mt-1 font-code text-micro text-zinc-deep">{quote.lead.reference}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-graphite">{formatMoney(quote.amountCents)}</span>
                    <Badge tone={QUOTE_STATUS_TONE[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
                  </div>
                </div>
                {quote.status === QuoteStatus.ACCEPTED && (
                  <p className="mt-2 text-sm text-good">Accepted. This job is now in your jobs list.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
