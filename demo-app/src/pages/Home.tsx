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
import { findWorkHref } from '@/lib/find-work'
import { useDemo } from '../demo/store'
import { companyById, SEED_MANUALS } from '../demo/data'

const PROMISES = [
  'Free to post a job',
  'Your number stays private until you hire',
  'Reviews only from finished jobs',
  'Manuals labelled by source',
]

// src/app/page.tsx, with the session and manual count from the demo.
export function HomePage() {
  const session = useDemo((s) => s.session)
  const workHref = findWorkHref(session)
  const poweredBy = session ? companyById(session.companyId)?.name ?? session.name : null

  return (
    <div>
      <GarageDoorHero poweredBy={poweredBy} />

      <section className="mx-auto max-w-shell px-4 pb-16 pt-4 sm:pb-20">
        <h2 className="text-2xl font-semibold tracking-tight text-graphite">What do you need?</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TaskTile href="/request-technician" icon={<HireIcon />} title="Hire a pro" hint="Post a job, get quotes" />
          {workHref && <TaskTile href={workHref} icon={<WorkIcon />} title="Find work" hint="Quote on local jobs" />}
          <TaskTile href="/marketplace" icon={<MarketIcon />} title="Marketplace" hint="Buy and sell parts" />
          <TaskTile href="/manuals" icon={<ManualIcon />} title="Manuals" hint={`${SEED_MANUALS.length} demo manuals`} />
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
