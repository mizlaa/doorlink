import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { getSession } from '@/lib/auth'
import { poweredByName } from '@/lib/powered-by'
import { findWorkHref } from '@/lib/find-work'
import { GarageDoorHero } from '@/components/garage-door/GarageDoorHero'
import { TaskTile } from '@/components/ui/TaskTile'
import {
  CalculatorIcon,
  ComplianceIcon,
  DoorIcon,
  HelpIcon,
  HireIcon,
  IdentifyIcon,
  ManualIcon,
  MarketIcon,
  WorkIcon,
} from '@/components/ui/TaskIcons'

// Rendered per visitor: the door reveals whoever is signed in ("Powered by …"),
// so this page must never be served from a shared static copy.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  description:
    'Automated doors, connected professionals, one platform. Find a door or gate technician, browse manufacturer manuals, and identify the part you need.',
  alternates: { canonical: '/' },
}

/**
 * The manual count on the tile is read from the database, never typed
 * into the markup. If it cannot be read, the tile simply goes without it.
 */
async function manualCount(): Promise<number | null> {
  try {
    return await prisma.document.count({ where: { isPublished: true } })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return null
  }
}

/** The four promises that used to take six paragraphs. */
const PROMISES = [
  'Free to post a job',
  'Your number stays private until you hire',
  'Reviews only from finished jobs',
  'Manuals labelled by source',
]

export default async function HomePage() {
  const [manuals, session] = await Promise.all([manualCount(), getSession()])
  const workHref = findWorkHref(session)
  const poweredBy = await poweredByName(session)

  return (
    <div>
      <GarageDoorHero poweredBy={poweredBy} />

      <section className="mx-auto max-w-shell px-4 pb-16 pt-4 sm:pb-20">
        <h2 className="text-2xl font-semibold tracking-tight text-graphite">What do you need?</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TaskTile href="/request-technician" icon={<HireIcon />} title="Hire a pro" hint="Post a job, get quotes" />
          {workHref && <TaskTile href={workHref} icon={<WorkIcon />} title="Find work" hint="Quote on local jobs" />}
          <TaskTile href="/marketplace" icon={<MarketIcon />} title="Marketplace" hint="Buy and sell parts" />
          <TaskTile
            href="/manuals"
            icon={<ManualIcon />}
            title="Manuals"
            hint={manuals ? `${manuals.toLocaleString('en-AU')} manuals` : 'Search the library'}
          />
          <TaskTile href="/tools/spring-calculator" icon={<CalculatorIcon />} title="Spring calculator" hint="Size a spring" />
          <TaskTile href="/configure" icon={<DoorIcon />} title="Design" hint="Doors, gates, fences, shutters" />
          <TaskTile href="/find" icon={<IdentifyIcon />} title="Identify my door" hint="Find the model" />
          <TaskTile href="/compliance" icon={<ComplianceIcon />} title="Compliance pack" hint="Safety documents" />
          <TaskTile href="/find/unknown" icon={<HelpIcon />} title="Not sure?" hint="Answer a few questions" />
        </div>

        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6 text-sm text-graphite-soft">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-natural/20 text-good"
                aria-hidden="true"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="m2.5 6.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {promise}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
