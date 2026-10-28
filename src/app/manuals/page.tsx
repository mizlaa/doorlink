import type { Metadata } from 'next'
import Link from 'next/link'
import type { DocumentKind } from '@prisma/client'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { SourceBadge } from '@/components/ui/SourceBadge'
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  DOCUMENT_ORIGIN_TONE,
} from '@/lib/labels'
import {
  extractSnippet,
  formatFileSize,
  manualFacets,
  searchManuals,
  type ManualSearchParams,
} from '@/lib/manuals'

export const metadata: Metadata = {
  title: 'User manuals',
  description:
    'Search installation manuals, programming guides, wiring diagrams and troubleshooting documents for automated doors, gates, motors and access systems.',
  alternates: { canonical: '/manuals' },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value || undefined
}

function buildHref(current: ManualSearchParams, changes: Partial<ManualSearchParams>): string {
  const next = { ...current, ...changes, page: undefined }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.manufacturer) params.set('manufacturer', next.manufacturer)
  if (next.category) params.set('category', next.category)
  if (next.kind) params.set('kind', next.kind)
  const query = params.toString()
  return query ? `/manuals?${query}` : '/manuals'
}

export default async function ManualsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const params: ManualSearchParams = {
    q: firstValue(raw.q),
    manufacturer: firstValue(raw.manufacturer),
    category: firstValue(raw.category),
    kind: firstValue(raw.kind) as DocumentKind | undefined,
    page: Number(firstValue(raw.page)) || 1,
  }

  let result
  let facets
  try {
    ;[result, facets] = await Promise.all([searchManuals(params), manualFacets()])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="The manuals library" reason="Can't reach the document database right now." />
      </div>
    )
  }

  const hasFilters = Boolean(params.q || params.manufacturer || params.category || params.kind)

  return (
    <div className="mx-auto max-w-shell px-4 py-10 sm:py-14">
      <header className="max-w-prose">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">User manuals</h1>
            <p className="mt-2 text-graphite-soft">
              Installation, programming, wiring and troubleshooting manuals.
            </p>
          </div>
          <Link
            href="/manuals/submit"
            className="inline-flex h-11 shrink-0 items-center rounded border border-line bg-paper px-4 text-sm font-medium text-graphite transition-colors hover:border-signal hover:text-signal"
          >
            Submit a manual
          </Link>
        </div>
      </header>

      <form action="/manuals" className="mt-6 flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
           placeholder="Search by model, document code, or a term inside the manual..."
          aria-label="Search manuals"
          className="h-11 min-w-0 flex-1 rounded border border-line bg-paper px-3 text-sm text-graphite placeholder:text-zinc focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
        />
        {params.manufacturer && <input type="hidden" name="manufacturer" value={params.manufacturer} />}
        {params.category && <input type="hidden" name="category" value={params.category} />}
        {params.kind && <input type="hidden" name="kind" value={params.kind} />}
        <button
          type="submit"
          className="h-11 shrink-0 rounded bg-signal px-5 text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
        >
          Search
        </button>
      </form>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <FacetGroup
            title="Manufacturer"
            limit={10}
            items={facets.manufacturers.map((m) => ({
              label: m.name,
              count: m.count,
              href: buildHref(params, { manufacturer: params.manufacturer === m.slug ? undefined : m.slug }),
              active: params.manufacturer === m.slug,
            }))}
          />
          <FacetGroup
            title="Category"
            items={facets.categories.map((c) => ({
              label: c.name,
              count: c.count,
              href: buildHref(params, { category: params.category === c.slug ? undefined : c.slug }),
              active: params.category === c.slug,
            }))}
          />
          <FacetGroup
            title="Document type"
            items={facets.kinds.map((k) => ({
              label: DOCUMENT_KIND_LABELS[k.kind],
              count: k.count,
              href: buildHref(params, { kind: params.kind === k.kind ? undefined : k.kind }),
              active: params.kind === k.kind,
            }))}
          />
          {hasFilters && (
            <Link href="/manuals" className="mt-4 inline-block text-sm font-medium text-signal hover:text-signal-hover">
              Clear all filters
            </Link>
          )}
        </aside>

        <section className="min-w-0 flex-1">
          <p className="mb-4 text-sm text-zinc-deep">
            {result.total} {result.total === 1 ? 'document' : 'documents'}
            {hasFilters ? ' matching your search' : ' in the library'}
          </p>

          {result.documents.length === 0 ? (
            <EmptyState
              title="No manuals matched"
              description="Try a broader term, a model code, or clear the filters."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {result.documents.map((doc) => {
                const snippet = extractSnippet(doc.searchText, params.q)
                return (
                  <li key={doc.id}>
                    <Link
                      href={`/manuals/${doc.slug}`}
                      className="block rounded-md border border-line bg-paper p-5 transition-colors hover:border-signal"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-graphite">{doc.title}</p>
                          <p className="mt-1 text-sm text-zinc-deep">
                            {doc.manufacturer?.name ?? 'Unattributed'}
                            {doc.model && (
                              <>
                                {' · '}
                                <span className="font-code">{doc.model.modelCode}</span>
                              </>
                            )}
                            {doc.category && ` · ${doc.category.name}`}
                            {doc.pageCount && ` · ${doc.pageCount} pages`}
                            {formatFileSize(doc.fileSizeBytes) && ` · ${formatFileSize(doc.fileSizeBytes)}`}
                          </p>
                        </div>
                        {/* No shrink-0 here: these two badges together are wider than a
                            phone, and refusing to shrink made the whole page
                            scroll sideways rather than wrapping them. */}
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="neutral">{DOCUMENT_KIND_LABELS[doc.kind]}</Badge>
                          <Badge tone={DOCUMENT_ORIGIN_TONE[doc.origin]}>
                            {DOCUMENT_ORIGIN_LABELS[doc.origin]}
                          </Badge>
                        </div>
                      </div>

                      {snippet && (
                        <p className="mt-3 border-l-2 border-line pl-3 text-sm text-graphite-soft">
                          {snippet}
                        </p>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {result.pageCount > 1 && (
            <nav className="mt-6 flex items-center gap-3 text-sm" aria-label="Pagination">
              {result.page > 1 && (
                <Link
                  href={`${buildHref(params, {})}${buildHref(params, {}).includes('?') ? '&' : '?'}page=${result.page - 1}`}
                  className="font-medium text-signal hover:text-signal-hover"
                >
                  Previous
                </Link>
              )}
              <span className="text-zinc-deep">
                Page {result.page} of {result.pageCount}
              </span>
              {result.page < result.pageCount && (
                <Link
                  href={`${buildHref(params, {})}${buildHref(params, {}).includes('?') ? '&' : '?'}page=${result.page + 1}`}
                  className="font-medium text-signal hover:text-signal-hover"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * A filter list. Long ones (there are 160-odd manufacturers) show the
 * biggest few, plus whatever is selected, and fold the rest into an
 * "All" disclosure — a plain <details>, so it works without JavaScript.
 */
function FacetGroup({
  title,
  items,
  limit,
}: {
  title: string
  items: Array<{ label: string; count: number; href: string; active: boolean }>
  limit?: number
}) {
  if (items.length === 0) return null
  const folded = limit !== undefined && items.length > limit + 2
  const top = folded
    ? new Set([...items].sort((a, b) => b.count - a.count).slice(0, limit).map((item) => item.href))
    : null
  const shown = top ? items.filter((item) => top.has(item.href) || item.active) : items
  const rest = top ? items.filter((item) => !top.has(item.href) && !item.active) : []
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">{title}</h2>
      <FacetList items={shown} />
      {rest.length > 0 && (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none rounded px-2 py-1.5 text-sm font-medium text-signal hover:bg-rail [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">All {items.length} {title.toLowerCase()}s</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className="mt-1 max-h-80 overflow-y-auto pr-1">
            <FacetList items={rest} />
          </div>
        </details>
      )}
    </div>
  )
}

function FacetList({ items }: { items: Array<{ label: string; count: number; href: string; active: boolean }> }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={
              item.active
                ? 'flex items-center justify-between rounded bg-signal-tint px-2 py-1.5 text-sm font-medium text-signal'
                : 'flex items-center justify-between rounded px-2 py-1.5 text-sm text-graphite hover:bg-rail'
            }
          >
            <span className="truncate">{item.label}</span>
            <span className="ml-2 shrink-0 text-micro text-zinc-deep">{item.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
