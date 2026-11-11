import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { describeSpec, parseSpec } from '@/lib/configurator/options'
import { formatFileSize } from '@/lib/manuals'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { DOCUMENT_KIND_LABELS, DOCUMENT_ORIGIN_LABELS, DOCUMENT_ORIGIN_TONE } from '@/lib/labels'

export const metadata: Metadata = { title: 'Saved' }

export default async function SavedPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  let configurations
  let manuals
  try {
    ;[configurations, manuals] = await Promise.all([
      prisma.doorConfiguration.findMany({
        where: { userId: session.userId },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.savedManual.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        include: {
          document: {
            include: {
              manufacturer: { select: { name: true } },
              model: { select: { modelCode: true } },
            },
          },
        },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Your saved items" reason="Can't reach the database right now." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Saved</h1>
        <p className="mt-1 text-graphite-soft">Door configurations and manuals you have kept.</p>
      </header>

      <section className="mb-12">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">
            Door configurations ({configurations.length})
          </h2>
          <Link href="/configure" className="text-sm font-medium text-signal hover:text-signal-hover">
            Design another →
          </Link>
        </div>

        {configurations.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            description="Design a door and save it, then send the specification to technicians for a price."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {configurations.map((configuration) => {
              const spec = parseSpec(configuration.spec)
              const rows = describeSpec(spec)
              return (
                <li key={configuration.id} className="rounded-md border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="font-medium text-graphite">{configuration.name}</p>
                    <span className="text-micro text-zinc-deep">
                      {configuration.updatedAt.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium' })}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-graphite-soft">
                    {rows
                      .slice(0, 5)
                      .map((row) => row.value)
                      .join(' · ')}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    <Link
                      href={`/configure?spec=${encodeURIComponent(JSON.stringify(spec))}`}
                      className="font-medium text-signal hover:text-signal-hover"
                    >
                      Open in the configurator
                    </Link>
                    <Link
                      href={`/request-technician?spec=${encodeURIComponent(JSON.stringify(spec))}`}
                      className="font-medium text-signal hover:text-signal-hover"
                    >
                      Get quotes on this
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">
            Manuals ({manuals.length})
          </h2>
          <Link href="/manuals" className="text-sm font-medium text-signal hover:text-signal-hover">
            Search the library →
          </Link>
        </div>

        {manuals.length === 0 ? (
          <EmptyState
            title="No saved manuals"
            description="Save a manual from its page and it will be here next time you are under a door with no signal to search."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {manuals.map((saved) => (
              <li key={saved.id}>
                <Link
                  href={`/manuals/${saved.document.slug}`}
                  className="block rounded-md border border-line bg-paper p-4 transition-colors hover:border-signal"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-graphite">{saved.document.title}</p>
                      <p className="mt-0.5 text-micro text-zinc-deep">
                        {[
                          saved.document.manufacturer?.name,
                          saved.document.model?.modelCode,
                          formatFileSize(saved.document.fileSizeBytes),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="neutral">{DOCUMENT_KIND_LABELS[saved.document.kind]}</Badge>
                      <Badge tone={DOCUMENT_ORIGIN_TONE[saved.document.origin]}>
                        {DOCUMENT_ORIGIN_LABELS[saved.document.origin]}
                      </Badge>
                    </div>
                  </div>
                  {saved.note && <p className="mt-2 text-sm text-graphite-soft">{saved.note}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
