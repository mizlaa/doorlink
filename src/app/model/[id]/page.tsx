import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CompatibilityConfidence, DocumentKind } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { isConnected } from '@/lib/integrations'
import { toJsonLd } from '@/lib/json-ld'
import { formatMoney } from '@/lib/money'
import { Badge } from '@/components/ui/Badge'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { SpecList } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { NotConnected } from '@/components/ui/NotConnected'
import { DOCUMENT_KIND_LABELS } from '@/lib/labels'
import { AddToCartButton } from '@/app/cart/AddToCartButton'
import { SPEC_NOTE_LABEL, SPEC_SOURCE_LABEL } from '@/lib/motors/specs'
import { InterestedButton } from '@/components/marketplace/InterestedButton'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const CONFIDENCE_TONE: Record<CompatibilityConfidence, 'good' | 'signal' | 'caution'> = {
  CONFIRMED: 'good',
  LIKELY: 'signal',
  UNCONFIRMED: 'caution',
}

const CONFIDENCE_LABEL: Record<CompatibilityConfidence, string> = {
  CONFIRMED: 'Confirmed',
  LIKELY: 'Likely',
  UNCONFIRMED: 'Unconfirmed',
}

async function getModel(id: string) {
  return prisma.model.findUnique({
    where: { id },
    include: {
      manufacturer: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      productLine: { select: { id: true, name: true } },
      specs: { orderBy: { sortOrder: 'asc' } },
      documents: { orderBy: { createdAt: 'desc' } },
      listings: {
        where: { status: 'ACTIVE' },
        orderBy: { priceCents: 'asc' },
        include: { organization: { select: { name: true } }, seller: { select: { name: true } } },
      },
      compatibleFrom: {
        include: {
          toModel: { select: { id: true, name: true, modelCode: true, category: { select: { name: true } } } },
        },
      },
      compatibleTo: {
        include: {
          fromModel: {
            select: { id: true, name: true, modelCode: true, category: { select: { name: true } } },
          },
        },
      },
    },
  })
}

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  try {
    const model = await getModel(id)
    if (!model) return { title: 'Model not found' }
    return {
      title: `${model.name} · ${model.manufacturer.name}`,
      description:
        model.summary ??
        `${model.name} (${model.modelCode}) by ${model.manufacturer.name}: specifications, documents, and compatible parts.`,
      alternates: { canonical: `/model/${model.id}` },
    }
  } catch {
    return { title: 'Model' }
  }
}

export default async function ModelProfilePage({ params }: PageProps) {
  const { id } = await params
  const session = await getSession()

  let model: Awaited<ReturnType<typeof getModel>>
  try {
    model = await getModel(id)
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error

    // The catalogue database itself isn't reachable — an honest "not
    // connected" state, not a crash and not a fake product page. A real
    // query bug isn't caught here — it's rethrown to Next.js's own error
    // handling instead of being disguised as "not connected".
    return (
      <div className="mx-auto max-w-shell px-4 py-12">
        <NotConnected
          feature="The product catalogue"
          reason="The database isn't reachable right now, so this model's details can't be loaded."
        />
      </div>
    )
  }

  if (!model) notFound()

  // Where a rating came from is shown as a sentence under the list, not
  // as a row: a long URL in a two-column spec grid is unreadable.
  const specSource = model.specs.find((spec) => spec.label === SPEC_SOURCE_LABEL)?.value
  const specNote = model.specs.find((spec) => spec.label === SPEC_NOTE_LABEL)?.value
  const ratings = model.specs.filter(
    (spec) => spec.label !== SPEC_SOURCE_LABEL && spec.label !== SPEC_NOTE_LABEL
  )

  const compatible = [
    ...model.compatibleFrom.map((link) => ({
      id: link.id,
      kind: link.kind,
      confidence: link.confidence,
      note: link.note,
      related: link.toModel,
    })),
    ...model.compatibleTo.map((link) => ({
      id: link.id,
      kind: link.kind,
      confidence: link.confidence,
      note: link.note,
      related: link.fromModel,
    })),
  ]

  const storageConnected = isConnected('storage')

  // Mirrors what the page already shows visibly (including the DataSource
  // badge) — nothing here is asserted to a crawler that a person looking
  // at the page couldn't already see for themselves.
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: model.name,
    sku: model.modelCode,
    brand: { '@type': 'Brand', name: model.manufacturer.name },
    category: model.category.name,
    ...(model.summary ? { description: model.summary } : {}),
    ...(model.listings.length > 0
      ? {
          offers: model.listings.map((listing) => ({
            '@type': 'Offer',
            price: (listing.priceCents / 100).toFixed(2),
            priceCurrency: listing.currency,
            availability: 'https://schema.org/InStock',
          })),
        }
      : {}),
  }

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(productJsonLd) }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-zinc-deep">
        <Link href="/find" className="hover:text-signal">
          Finder
        </Link>{' '}
        / <span className="text-graphite">{model.name}</span>
      </nav>

      <div className="flex flex-col gap-2 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-code text-sm text-zinc-deep">{model.modelCode}</p>
          <h1 className="text-2xl font-semibold text-graphite">{model.name}</h1>
          <p className="mt-1 text-sm text-zinc-deep">
            {model.manufacturer.name} · {model.category.name}
            {model.productLine ? ` · ${model.productLine.name}` : ''}
          </p>
        </div>
        <SourceBadge source={model.dataSource} />
      </div>

      {model.summary && <p className="mt-4 max-w-prose text-graphite-soft">{model.summary}</p>}

      <div className="mt-10 grid gap-10 lg:grid-cols-3">
        <div className="flex flex-col gap-10 lg:col-span-2">
          <section aria-labelledby="specs-heading">
            <h2
              id="specs-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep"
            >
              Specifications
            </h2>
            {ratings.length > 0 ? (
              <>
                <SpecList
                  items={ratings.map((spec) => ({
                    label: spec.label,
                    value: spec.value,
                    unit: spec.unit ?? undefined,
                  }))}
                />
                {specSource && (
                  <p className="mt-3 text-sm text-zinc-deep">
                    Ratings from{' '}
                    <a
                      href={specSource}
                      className="text-signal underline"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {hostOf(specSource)}
                    </a>
                    {specNote ? `. ${specNote}` : '.'} Slope, wind and hinge condition all change what a motor
                    can move, so confirm against the manual.
                  </p>
                )}
              </>
            ) : (
              <EmptyState title="No specifications recorded yet" />
            )}
          </section>

          <section aria-labelledby="documents-heading">
            <h2
              id="documents-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep"
            >
              Documents
            </h2>
            {model.documents.length === 0 ? (
              <EmptyState title="No documents on file for this model yet" />
            ) : !storageConnected ? (
              <NotConnected
                feature="Document downloads"
                reason={`${model.documents.length} document${model.documents.length === 1 ? '' : 's'} on file (${model.documents
                  .map((doc) => DOCUMENT_KIND_LABELS[doc.kind])
                  .join(', ')}), but file storage isn't connected, so they can't be served yet.`}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {model.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between rounded border border-line px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-graphite">{doc.title}</p>
                      <p className="text-micro uppercase tracking-wide text-zinc-deep">
                        {DOCUMENT_KIND_LABELS[doc.kind]} · v{doc.version}
                      </p>
                    </div>
                    <SourceBadge source={doc.dataSource} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="compatible-heading">
            <h2
              id="compatible-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep"
            >
              Compatible parts
            </h2>
            {compatible.length === 0 ? (
              <EmptyState
                title="No compatibility records yet"
                description="Nothing has been linked to this model."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {compatible.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-4 rounded border border-line px-4 py-3"
                  >
                    <div>
                      <Link
                        href={`/model/${link.related.id}`}
                        className="text-sm font-medium text-graphite hover:text-signal"
                      >
                        {link.related.name}
                      </Link>
                      <p className="text-micro uppercase tracking-wide text-zinc-deep">
                        {link.related.category.name} · {link.kind.replace(/_/g, ' ').toLowerCase()}
                      </p>
                    </div>
                    <Badge tone={CONFIDENCE_TONE[link.confidence]}>{CONFIDENCE_LABEL[link.confidence]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside aria-labelledby="listings-heading">
          <h2
            id="listings-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep"
          >
            Available from
          </h2>
          {model.listings.length === 0 ? (
            <EmptyState
              title="No active listings"
              description="No supplier currently lists this model for sale."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {model.listings.map((listing) => (
                <li key={listing.id} className="rounded-md border border-line p-4">
                  <p className="text-sm font-medium text-graphite">
                    {listing.organization?.name ?? listing.seller?.name ?? 'a Doorlink member'}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-graphite">
                    {formatMoney(listing.priceCents, listing.currency)}
                  </p>
                  <p className="mt-1 text-micro uppercase tracking-wide text-zinc-deep">
                    {listing.condition.toLowerCase()} · {listing.stockQty} in stock
                  </p>
                  <div className="mt-2">
                    <SourceBadge source={listing.dataSource} />
                  </div>
                  <div className="mt-3 flex flex-col items-start gap-2">
                    {session ? (
                      <>
                        <AddToCartButton listingId={listing.id} />
                        <InterestedButton listingId={listing.id} />
                      </>
                    ) : (
                      <Link href="/sign-in" className="text-sm font-medium text-signal hover:text-signal-hover">
                        Sign in to buy
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
