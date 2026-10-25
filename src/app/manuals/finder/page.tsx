import type { Metadata } from 'next'
import Link from 'next/link'
import { Region } from '@prisma/client'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { isConfidentMatch } from '@/lib/manuals/normalise'
import {
  findManuals,
  manualCategories,
  manufacturersWithManuals,
  modelsForManufacturer,
} from '@/lib/manuals/finder'
import { DocumentCard } from './DocumentCard'

export const metadata: Metadata = {
  title: 'Find your manual',
  description:
    'Tell Doorlink what equipment you have and it finds the manufacturer documentation for it.',
  alternates: { canonical: '/manuals/finder' },
}

// The guided finder.
//
// Runs on the query string rather than as one client component: each
// step is a fast server render, the back button walks back through the
// choices, and a half-made selection survives a phone locking in a
// driveway. Same reasoning as the inspection cascade.
//
// Every step also accepts a free-text search, because a technician who
// already knows "MT60" should never have to click through three
// pickers to say so.

function Step({ n, label, done }: { n: number; label: string; done: boolean }) {
  return (
    <span className={done ? 'text-good' : 'text-zinc-deep'}>
      {n}. {label}
    </span>
  )
}

export default async function ManualFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; manufacturer?: string; model?: string }>
}) {
  const params = await searchParams
  const q = (params.q ?? '').trim()
  const { category, manufacturer } = params

  try {
    // A direct query short-circuits the whole cascade.
    if (q) {
      const { results, byId } = await findManuals({
        q,
        categorySlug: category,
        manufacturerSlug: manufacturer,
        region: Region.AU,
      })

      const confident = results.filter((r) => isConfidentMatch(r.modelMatch))
      const possible = results.filter((r) => !isConfidentMatch(r.modelMatch))

      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Header />
          <SearchBox defaultValue={q} />

          {results.length === 0 ? (
            <EmptyState
              title={`Nothing matches “${q}”`}
              description="Try the model number stamped on the motor, the manufacturer's name, or a phrase from the manual such as “limit setting”."
              action={
                <span className="flex flex-wrap items-center gap-3">
                  <Link href="/manuals/finder" className="text-sm font-medium text-signal hover:underline">
                    Start from equipment type instead
                  </Link>
                  <Link href="/manuals/submit" className="text-sm font-medium text-signal hover:underline">
                    Add a manual
                  </Link>
                </span>
              }
            />
          ) : (
            <div className="mt-6 flex flex-col gap-6">
              {confident.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-graphite">
                    Documents for this model
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {confident.map((r) => {
                      const doc = byId.get(r.document.id)
                      return doc ? (
                        <DocumentCard key={r.document.id} doc={doc} reason={r.reason} confident />
                      ) : null
                    })}
                  </ul>
                </section>
              )}

              {possible.length > 0 && (
                <section>
                  {/* Stated as a maybe, because it is one. Brief §10:
                      an uncertain identification must never be shown as
                      an exact one. */}
                  <h2 className="mb-1 text-sm font-semibold text-graphite">
                    {confident.length > 0 ? 'Other possible matches' : 'Possible matches'}
                  </h2>
                  <p className="mb-2 text-micro text-zinc-deep">
                    These are close but not an exact model match. Check the model number on your
                    equipment before relying on one.
                  </p>
                  <ul className="flex flex-col gap-3">
                    {possible.map((r) => {
                      const doc = byId.get(r.document.id)
                      return doc ? (
                        <DocumentCard
                          key={r.document.id}
                          doc={doc}
                          reason={r.reason}
                          confident={false}
                        />
                      ) : null
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )
    }

    // Step 3 — models for the chosen manufacturer.
    if (manufacturer) {
      const models = await modelsForManufacturer(manufacturer)
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Header />
          <SearchBox />
          <ol className="mb-5 flex flex-wrap gap-x-3 text-micro">
            <Step n={1} label="Equipment" done />
            <Step n={2} label="Manufacturer" done />
            <Step n={3} label="Model" done={false} />
          </ol>

          <h2 className="mb-3 text-lg font-semibold text-graphite">Which model?</h2>
          {models.length === 0 ? (
            <EmptyState title="No models recorded for this manufacturer yet" />
          ) : (
            <ul className="flex flex-col gap-2">
              {models.map((model) => (
                <li key={model.id}>
                  <Link
                    href={`/manuals/finder?q=${encodeURIComponent(model.modelCode)}`}
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded border border-line bg-paper px-4 py-3 text-sm hover:border-signal hover:bg-signal-tint"
                  >
                    <span className="min-w-0">
                      <span className="block font-code text-micro text-zinc-deep">
                        {model.modelCode}
                      </span>
                      <span className="block truncate font-medium text-graphite">{model.name}</span>
                    </span>
                    <span className="shrink-0 text-micro text-zinc-deep">
                      {model._count.documents === 0
                        ? 'No documents yet'
                        : `${model._count.documents} document${model._count.documents === 1 ? '' : 's'}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <UnknownModel />
        <AddManual />
        </div>
      )
    }

    // Step 2 — manufacturers.
    if (category) {
      const manufacturers = await manufacturersWithManuals(category)
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Header />
          <SearchBox />
          <ol className="mb-5 flex flex-wrap gap-x-3 text-micro">
            <Step n={1} label="Equipment" done />
            <Step n={2} label="Manufacturer" done={false} />
            <Step n={3} label="Model" done={false} />
          </ol>

          <h2 className="mb-3 text-lg font-semibold text-graphite">Who made it?</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {manufacturers.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/manuals/finder?category=${category}&manufacturer=${m.slug}`}
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded border border-line bg-paper px-4 py-3 text-sm hover:border-signal hover:bg-signal-tint"
                >
                  <span className="font-medium text-graphite">{m.name}</span>
                  <span className="text-micro text-zinc-deep">
                    {m.country ?? ''} {m._count.documents}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <UnknownModel />
        <AddManual />
        </div>
      )
    }

    // Step 1 — equipment type.
    const categories = await manualCategories()
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Header />
        <SearchBox />

        <h2 className="mb-3 text-lg font-semibold text-graphite">What are you looking for?</h2>
        {categories.length === 0 ? (
          <EmptyState
            title="The manual library is empty"
            description="Import the seed data with npm run manuals:import to populate it."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/manuals/finder?category=${c.slug}`}
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded border border-line bg-paper px-4 py-3 text-sm hover:border-signal hover:bg-signal-tint"
                >
                  <span className="font-medium text-graphite">{c.name}</span>
                  <span className="text-micro text-zinc-deep">{c._count.documents}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <UnknownModel />
        <AddManual />
      </div>
    )
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <NotConnected feature="The manual finder" reason="Can't reach the document database right now." />
      </div>
    )
  }
}

function Header() {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight text-graphite">Find your manual</h1>
      <p className="mt-1 text-graphite-soft">
        Search by model or manufacturer.
      </p>
    </header>
  )
}

function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/manuals/finder" className="mb-6">
      <label htmlFor="q" className="sr-only">
        Search by model number, manufacturer or a phrase from the manual
      </label>
      <input
        id="q"
        name="q"
        defaultValue={defaultValue}
        placeholder="Model number, manufacturer, or “limit setting”"
        className="h-11 w-full rounded border border-line bg-paper px-3 text-sm text-graphite placeholder:text-zinc focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
      />
      <p className="mt-1.5 text-micro text-zinc-deep">
        MT60, MT-60 and mt 60 all find the same opener.
      </p>
    </form>
  )
}

/**
 * The path for someone who cannot read a faded label. Deliberately not
 * a dead end: it explains where the number usually is, which solves the
 * problem more often than any picker.
 */
function UnknownModel() {
  return (
    <Panel className="mt-8 border-dashed">
      <PanelBody className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-graphite">I don&rsquo;t know my model</h2>
        <p className="text-sm text-graphite-soft">
          Check the label on the motor, inside the cover or on the remote, and search any part of it.
          An error code works too.
        </p>
      </PanelBody>
    </Panel>
  )
}

/**
 * The way in for a manual Doorlink does not have.
 *
 * Says up front that an upload is reviewed before it appears. Somebody
 * who expects their file to be searchable immediately and finds it is
 * not will assume it failed — the honest sentence here costs nothing and
 * saves that.
 */
function AddManual() {
  return (
    <Panel className="mt-4">
      <PanelBody className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-graphite">Can&rsquo;t find your manual?</h2>
        <p className="text-sm text-graphite-soft">
          Send in your copy. We check it before it goes live.
        </p>
        <div>
          <Link
            href="/manuals/submit"
            className="inline-flex min-h-[44px] items-center rounded bg-signal px-4 py-2 text-sm font-medium text-paper hover:bg-signal-deep"
          >
            Add a manual
          </Link>
        </div>
      </PanelBody>
    </Panel>
  )
}
