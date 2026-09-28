import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ActionStatus, InspectionStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NoOrganizationError, requireInspectionScope } from '@/lib/inspections/scope'
import { compareInspections } from '@/lib/inspections/history'
import { RbacError } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel'
import {
  ACTION_STATUS_LABELS,
  ACTION_STATUS_TONE,
  ASSET_TYPE_LABELS,
  INSPECTION_RESULT_LABELS,
  INSPECTION_RESULT_TONE,
  SEVERITY_LABELS,
} from '@/lib/labels'

export const metadata: Metadata = { title: 'Asset' }

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
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
    if (error instanceof NoOrganizationError) redirect('/inspections')
    if (error instanceof RbacError) redirect('/')
    throw error
  }

  const { id } = await params

  let asset
  try {
    asset = await prisma.asset.findFirst({
      where: { id, organizationId: scope.organizationId },
      include: {
        client: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, addressLine: true, suburb: true } },
        inspections: {
          orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
          include: {
            technician: { select: { name: true } },
            answers: { select: { questionCode: true, status: true } },
            _count: { select: { findings: { where: { dismissedAt: null } } } },
          },
        },
        actions: {
          where: { status: { notIn: [ActionStatus.CLOSED, ActionStatus.VERIFIED] } },
          orderBy: { severity: 'desc' },
        },
      },
    })
    if (!asset) notFound()
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="This asset" reason="Can't reach the database right now." />
      </div>
    )
  }

  const completed = asset.inspections.filter(
    (inspection) => inspection.status === InspectionStatus.COMPLETED
  )

  // Compare the two most recent completed inspections. This is the whole
  // reason history lives on the asset rather than on the visit.
  const comparison =
    completed.length >= 2
      ? compareInspections(
          completed[0].answers.map((answer) => ({
            questionCode: answer.questionCode,
            status: answer.status,
            valueText: null,
            valueNumber: null,
            valueDate: null,
            valueChoices: [],
            note: null,
            evidenceCount: 0,
          })),
          completed[1].answers.map((answer) => ({
            questionCode: answer.questionCode,
            status: answer.status,
            valueText: null,
            valueNumber: null,
            valueDate: null,
            valueChoices: [],
            note: null,
            evidenceCount: 0,
          }))
        )
      : []

  const recurring = comparison.filter((c) => c.state === 'recurring')
  const resolved = comparison.filter((c) => c.state === 'resolved')
  const fresh = comparison.filter((c) => c.state === 'new')

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-micro uppercase tracking-wide text-zinc-deep">
          <Link href="/inspections" className="hover:underline">
            Inspections
          </Link>{' '}
          / {asset.client.name} / {asset.site.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-graphite">{asset.name}</h1>
        <p className="mt-1 text-graphite-soft">
          {ASSET_TYPE_LABELS[asset.assetType]}
          {asset.location ? ` · ${asset.location}` : ''} ·{' '}
          <span className="font-code">{asset.reference}</span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          {comparison.length > 0 && (
            <Panel>
              <PanelHeader>
                <h2 className="font-medium text-graphite">
                  Since the previous inspection ({formatDate(completed[1].submittedAt)})
                </h2>
              </PanelHeader>
              <PanelBody className="grid gap-4 text-sm">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ['Recurring', recurring.length, 'text-bad'],
                    ['New', fresh.length, 'text-caution'],
                    ['Resolved', resolved.length, 'text-good'],
                  ].map(([label, count, tone]) => (
                    <div key={String(label)}>
                      <p className="text-micro uppercase tracking-wide text-zinc-deep">{label}</p>
                      <p className={`text-xl font-semibold ${tone}`}>{count}</p>
                    </div>
                  ))}
                </div>
                {recurring.length > 0 && (
                  <div className="rounded border border-caution/30 bg-caution-tint px-3 py-2">
                    <p className="font-medium text-caution">
                      {recurring.length} check{recurring.length === 1 ? '' : 's'} failed at both
                      inspections
                    </p>
                    <p className="mt-1 text-graphite-soft">
                      Doorlink is reporting that the same answer repeated. It is not diagnosing why —
                      that needs someone looking at the equipment.
                    </p>
                  </div>
                )}
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHeader>
              <h2 className="font-medium text-graphite">
                Inspection history ({asset.inspections.length})
              </h2>
            </PanelHeader>
            <PanelBody>
              {asset.inspections.length === 0 ? (
                <EmptyState
                  title="No inspections yet"
                  description="The first inspection of this asset becomes the baseline everything after it compares against."
                />
              ) : (
                <ol className="grid gap-2">
                  {asset.inspections.map((inspection) => (
                    <li key={inspection.id}>
                      <Link
                        href={`/inspections/${inspection.id}`}
                        className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm hover:border-signal hover:bg-signal-tint"
                      >
                        <span>
                          <span className="block font-medium text-graphite">
                            {formatDate(inspection.submittedAt ?? inspection.createdAt)} ·{' '}
                            {inspection.inspectionType}
                          </span>
                          <span className="block text-micro text-zinc-deep">
                            {inspection.technician.name} ·{' '}
                            <span className="font-code">{inspection.reference}</span>
                            {inspection._count.findings > 0 &&
                              ` · ${inspection._count.findings} flagged`}
                          </span>
                        </span>
                        {inspection.result && (
                          <Badge tone={INSPECTION_RESULT_TONE[inspection.result]}>
                            {INSPECTION_RESULT_LABELS[inspection.result]}
                          </Badge>
                        )}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="grid gap-6">
          <Panel>
            <PanelHeader>
              <h2 className="font-medium text-graphite">Asset details</h2>
            </PanelHeader>
            <PanelBody>
              <dl className="grid gap-2 text-sm">
                {[
                  ['Type', ASSET_TYPE_LABELS[asset.assetType]],
                  ['Location', asset.location],
                  ['Manufacturer', asset.manufacturerName],
                  ['Model', asset.modelName],
                  ['Serial', asset.serialNumber],
                  ['Installed', asset.installedAt ? formatDate(asset.installedAt) : null],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex gap-3">
                    <dt className="w-28 shrink-0 text-zinc-deep">{label}</dt>
                    <dd className="text-graphite">
                      {value || <span className="text-zinc">Not recorded</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader>
              <h2 className="font-medium text-graphite">
                Outstanding actions ({asset.actions.length})
              </h2>
            </PanelHeader>
            <PanelBody>
              {asset.actions.length === 0 ? (
                <p className="text-sm text-graphite-soft">Nothing outstanding against this asset.</p>
              ) : (
                <ul className="grid gap-3">
                  {asset.actions.map((action) => (
                    <li key={action.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-graphite">{action.title}</p>
                        <Badge tone={ACTION_STATUS_TONE[action.status]}>
                          {ACTION_STATUS_LABELS[action.status]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-micro text-zinc-deep">
                        {SEVERITY_LABELS[action.severity]}
                        {action.dueAt ? ` · due ${formatDate(action.dueAt)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  )
}
