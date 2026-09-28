import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ActionStatus, InspectionResult, InspectionStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NoOrganizationError, requireInspectionScope } from '@/lib/inspections/scope'
import { RbacError } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import {
  ASSET_TYPE_LABELS,
  INSPECTION_RESULT_LABELS,
  INSPECTION_RESULT_TONE,
  INSPECTION_STATUS_LABELS,
  INSPECTION_STATUS_TONE,
} from '@/lib/labels'

export const metadata: Metadata = { title: 'Inspections' }

// The filters a technician actually reaches for, rather than one per
// enum value. "Attention" and "Actions" cut across status, which is the
// point — they answer "what needs me", not "what state is the row in".
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'attention', label: 'Attention required' },
  { key: 'actions', label: 'Actions outstanding' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function whereFor(filter: FilterKey) {
  switch (filter) {
    case 'draft':
      return { status: InspectionStatus.DRAFT }
    case 'in-progress':
      return { status: { in: [InspectionStatus.IN_PROGRESS, InspectionStatus.AWAITING_REVIEW] } }
    case 'completed':
      return { status: InspectionStatus.COMPLETED }
    case 'attention':
      return { result: { in: [InspectionResult.ATTENTION_REQUIRED, InspectionResult.FAILED] } }
    case 'actions':
      return { actions: { some: { status: { notIn: [ActionStatus.CLOSED, ActionStatus.VERIFIED] } } } }
    default:
      return {}
  }
}

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  const tradeAccess = await tradeSubscriptionAccess(session)
  if (!tradeAccess.allowed) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <TradeSubscriptionPaywall />
      </div>
    )
  }

  let scope
  try {
    scope = requireInspectionScope(session, 'inspection:read')
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      return (
        <div className="mx-auto max-w-shell px-4 py-10">
          <EmptyState
            title="Inspections belong to a company"
            description="An asset register is kept by the business that services the equipment. Ask an owner to add you to one, and this becomes your inspection list."
          />
        </div>
      )
    }
    if (error instanceof RbacError) redirect('/')
    throw error
  }

  const params = await searchParams
  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ?? 'all') as FilterKey
  const query = (params.q ?? '').trim()

  let loaded
  try {
    const where = {
      organizationId: scope.organizationId,
      ...whereFor(filter),
      ...(query
        ? {
            OR: [
              { reference: { contains: query, mode: 'insensitive' as const } },
              { client: { name: { contains: query, mode: 'insensitive' as const } } },
              { site: { name: { contains: query, mode: 'insensitive' as const } } },
              { asset: { name: { contains: query, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    }

    loaded = await Promise.all([
      prisma.inspection.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: {
          client: { select: { name: true } },
          site: { select: { name: true, suburb: true } },
          asset: { select: { id: true, name: true, assetType: true, reference: true } },
          technician: { select: { name: true } },
          _count: {
            select: {
              findings: { where: { dismissedAt: null } },
              actions: { where: { status: { notIn: [ActionStatus.CLOSED, ActionStatus.VERIFIED] } } },
            },
          },
        },
      }),
      prisma.inspection.count({ where: { organizationId: scope.organizationId } }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Inspections" reason="Can't reach the database right now." />
      </div>
    )
  }

  const [inspections, counts] = loaded

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Inspections</h1>
          <p className="mt-1 text-graphite-soft">
            {counts === 0
              ? 'Equipment your company services, and what was found.'
              : `${counts} inspection${counts === 1 ? '' : 's'} on record.`}
          </p>
        </div>
        <Link
          href="/inspections/new"
          className="inline-flex h-11 items-center rounded bg-signal px-4 text-sm font-medium text-paper hover:bg-signal-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          New inspection
        </Link>
      </header>

      <form className="mb-4" action="/inspections">
        {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        <label htmlFor="q" className="sr-only">
          Search inspections
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="Search by reference, customer, site or asset"
          className="h-11 w-full rounded border border-line bg-paper px-3 text-sm text-graphite placeholder:text-zinc focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
        />
      </form>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter inspections">
        {FILTERS.map((option) => {
          const href =
            option.key === 'all'
              ? `/inspections${query ? `?q=${encodeURIComponent(query)}` : ''}`
              : `/inspections?filter=${option.key}${query ? `&q=${encodeURIComponent(query)}` : ''}`
          const active = option.key === filter
          return (
            <Link
              key={option.key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded border border-signal bg-signal-tint px-3 py-1.5 text-sm font-medium text-signal'
                  : 'rounded border border-line bg-paper px-3 py-1.5 text-sm text-graphite-soft hover:border-zinc'
              }
            >
              {option.label}
            </Link>
          )
        })}
      </nav>

      {inspections.length === 0 ? (
        <EmptyState
          title={query ? `Nothing matches “${query}”` : 'No inspections yet'}
          description={
            query
              ? 'Try a reference, a customer name, or a site.'
              : 'Start one and it will be filed against the asset, so the next visit can compare against it.'
          }
        />
      ) : (
        <ul className="grid gap-3">
          {inspections.map((inspection) => (
            <li key={inspection.id}>
              <Panel className="transition-shadow hover:shadow-lift">
                <Link href={`/inspections/${inspection.id}`} className="block p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-graphite">
                        {inspection.client.name} — {inspection.site.name}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-graphite-soft">
                        {inspection.asset.name} · {ASSET_TYPE_LABELS[inspection.asset.assetType]}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {inspection.result && (
                        <Badge tone={INSPECTION_RESULT_TONE[inspection.result]}>
                          {INSPECTION_RESULT_LABELS[inspection.result]}
                        </Badge>
                      )}
                      <Badge tone={INSPECTION_STATUS_TONE[inspection.status]}>
                        {INSPECTION_STATUS_LABELS[inspection.status]}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-zinc-deep">
                    <span className="font-code">{inspection.reference}</span>
                    <span>{inspection.inspectionType}</span>
                    <span>{inspection.technician.name}</span>
                    <span>
                      {(inspection.submittedAt ?? inspection.createdAt).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    {inspection._count.findings > 0 && (
                      <span className="text-bad">
                        {inspection._count.findings} flagged item
                        {inspection._count.findings === 1 ? '' : 's'}
                      </span>
                    )}
                    {inspection._count.actions > 0 && (
                      <span className="text-caution">
                        {inspection._count.actions} action
                        {inspection._count.actions === 1 ? '' : 's'} outstanding
                      </span>
                    )}
                  </div>
                </Link>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
