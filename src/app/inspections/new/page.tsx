import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NoOrganizationError, requireInspectionScope } from '@/lib/inspections/scope'
import { templatesForAsset } from '@/lib/inspections/load'
import { RbacError } from '@/lib/rbac'
import { tradeSubscriptionAccess } from '@/lib/trade-subscription'
import { TradeSubscriptionPaywall } from '@/components/subscription/TradeSubscriptionPaywall'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel'
import { ASSET_TYPE_LABELS } from '@/lib/labels'
import { NewAssetForm, NewClientForm, NewSiteForm, StartInspectionForm } from './StepForms'

export const metadata: Metadata = { title: 'New inspection' }

// The cascade runs on the query string rather than in one large client
// component. Each step is a fast server render, the back button walks
// back through the steps, and a half-made selection survives the screen
// locking — all of which matter more on a phone at a loading dock than
// a single-page transition would.

const STEPS = ['Customer', 'Site', 'Asset', 'Start'] as const

function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro">
      {STEPS.map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={
              index < current
                ? 'text-good'
                : index === current
                  ? 'font-medium text-graphite'
                  : 'text-zinc'
            }
          >
            {index + 1}. {label}
          </span>
          {index < STEPS.length - 1 && <span className="text-line">/</span>}
        </li>
      ))}
    </ol>
  )
}

function PickList({
  items,
  hrefFor,
  emptyTitle,
  emptyDescription,
}: {
  items: { id: string; primary: string; secondary?: string | null }[]
  hrefFor: (id: string) => string
  emptyTitle: string
  emptyDescription: string
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={hrefFor(item.id)}
            className="flex min-h-[44px] items-center justify-between gap-3 rounded border border-line bg-paper px-4 py-3 text-sm hover:border-signal hover:bg-signal-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-graphite">{item.primary}</span>
              {item.secondary && (
                <span className="block truncate text-micro text-zinc-deep">{item.secondary}</span>
              )}
            </span>
            <span aria-hidden className="text-zinc">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; siteId?: string; assetId?: string }>
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
    scope = requireInspectionScope(session, 'inspection:write')
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <EmptyState
            title="Inspections belong to a company"
            description="Ask an owner to add you to one before starting an inspection."
          />
        </div>
      )
    }
    if (error instanceof RbacError) redirect('/inspections')
    throw error
  }

  const { clientId, siteId, assetId } = await searchParams

  try {
    // Step 4 — the asset is chosen, offer the templates that fit it.
    if (assetId) {
      const asset = await prisma.asset.findFirst({
        where: { id: assetId, organizationId: scope.organizationId },
        include: { client: { select: { name: true } }, site: { select: { name: true } } },
      })
      if (!asset) redirect('/inspections/new')

      const templates = await templatesForAsset(scope.organizationId, asset.assetType)

      return (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Steps current={3} />
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Start the inspection</h1>
          <p className="mt-1 text-graphite-soft">
            {asset.client.name} — {asset.site.name}
          </p>
          <p className="mt-0.5 text-sm text-zinc-deep">
            {asset.name} · {ASSET_TYPE_LABELS[asset.assetType]} ·{' '}
            <span className="font-code">{asset.reference}</span>
          </p>

          <Panel className="mt-6">
            <PanelBody>
              <StartInspectionForm
                assetId={asset.id}
                templates={templates}
                technicianName={session.name}
              />
            </PanelBody>
          </Panel>
        </div>
      )
    }

    // Step 3 — pick or add the asset.
    if (siteId) {
      const site = await prisma.site.findFirst({
        where: { id: siteId, organizationId: scope.organizationId },
        include: {
          client: { select: { id: true, name: true } },
          assets: {
            where: { archivedAt: null },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, assetType: true, location: true, reference: true },
          },
        },
      })
      if (!site) redirect('/inspections/new')

      return (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Steps current={2} />
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Which asset?</h1>
          <p className="mt-1 text-graphite-soft">
            {site.client.name} — {site.name}
          </p>

          <div className="mt-6">
            <PickList
              items={site.assets.map((asset) => ({
                id: asset.id,
                primary: asset.name,
                secondary: `${ASSET_TYPE_LABELS[asset.assetType]}${asset.location ? ` · ${asset.location}` : ''} · ${asset.reference}`,
              }))}
              hrefFor={(id) => `/inspections/new?clientId=${site.client.id}&siteId=${site.id}&assetId=${id}`}
              emptyTitle="No assets recorded at this site"
              emptyDescription="Add the piece of equipment you are about to inspect."
            />
          </div>

          <Panel className="mt-6">
            <PanelHeader>
              <h2 className="font-medium text-graphite">Add an asset</h2>
            </PanelHeader>
            <PanelBody>
              <NewAssetForm clientId={site.client.id} siteId={site.id} />
            </PanelBody>
          </Panel>
        </div>
      )
    }

    // Step 2 — pick or add the site.
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: scope.organizationId },
        include: {
          sites: {
            where: { archivedAt: null },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, addressLine: true, suburb: true },
          },
        },
      })
      if (!client) redirect('/inspections/new')

      return (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Steps current={1} />
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Which site?</h1>
          <p className="mt-1 text-graphite-soft">{client.name}</p>

          <div className="mt-6">
            <PickList
              items={client.sites.map((site) => ({
                id: site.id,
                primary: site.name,
                secondary: [site.addressLine, site.suburb].filter(Boolean).join(', ') || null,
              }))}
              hrefFor={(id) => `/inspections/new?clientId=${client.id}&siteId=${id}`}
              emptyTitle="No sites for this customer yet"
              emptyDescription="Add the address you are attending."
            />
          </div>

          <Panel className="mt-6">
            <PanelHeader>
              <h2 className="font-medium text-graphite">Add a site</h2>
            </PanelHeader>
            <PanelBody>
              <NewSiteForm clientId={client.id} />
            </PanelBody>
          </Panel>
        </div>
      )
    }

    // Step 1 — pick or add the customer.
    const clients = await prisma.client.findMany({
      where: { organizationId: scope.organizationId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, contactName: true, _count: { select: { sites: true } } },
    })

    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Steps current={0} />
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Which customer?</h1>
        <p className="mt-1 text-graphite-soft">
          The inspection is filed against their site and asset, so the next visit can compare against it.
        </p>

        <div className="mt-6">
          <PickList
            items={clients.map((client) => ({
              id: client.id,
              primary: client.name,
              secondary: `${client._count.sites} site${client._count.sites === 1 ? '' : 's'}${client.contactName ? ` · ${client.contactName}` : ''}`,
            }))}
            hrefFor={(id) => `/inspections/new?clientId=${id}`}
            emptyTitle="No customers yet"
            emptyDescription="Add the business whose equipment you are inspecting."
          />
        </div>

        <Panel className="mt-6">
          <PanelHeader>
            <h2 className="font-medium text-graphite">Add a customer</h2>
          </PanelHeader>
          <PanelBody>
            <NewClientForm />
          </PanelBody>
        </Panel>
      </div>
    )
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <NotConnected feature="Inspections" reason="Can't reach the database right now." />
      </div>
    )
  }
}
