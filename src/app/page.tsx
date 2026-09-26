import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { formatCommissionRate } from '@/lib/commission'
import { currentCommissionBps } from '@/lib/commission-settings'
import { GarageDoorHero } from '@/components/garage-door/GarageDoorHero'
import { RevealCard } from '@/components/ui/RevealCard'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  description:
    'Automated doors, connected professionals, one platform. Find a door or gate technician, browse manufacturer manuals, and identify the part you need.',
  alternates: { canonical: '/' },
}

/**
 * Counts shown on the landing page are read from the database, never
 * written into the markup. A homepage that advertises "10,000 manuals"
 * because someone typed it there is the exact kind of claim this build
 * does not make. If the number cannot be read, the sentence that needs
 * it is not rendered.
 */
async function landingFigures() {
  try {
    const [manuals, manufacturers, services, commissionBps, plans] = await Promise.all([
      prisma.document.count({ where: { isPublished: true } }),
      prisma.manufacturer.count(),
      prisma.serviceCategory.count({ where: { isActive: true } }),
      currentCommissionBps(),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, interval: true, priceCents: true, currency: true, description: true },
      }),
    ])
    return { manuals, manufacturers, services, commissionBps, plans, available: true as const }
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return {
      manuals: 0,
      manufacturers: 0,
      services: 0,
      commissionBps: null,
      plans: [],
      available: false as const,
    }
  }
}

const INTERVAL_SUFFIX = { WEEK: '/week', MONTH: '/month', YEAR: '/year' } as const

export default async function HomePage() {
  const figures = await landingFigures()

  return (
    <div>
      <GarageDoorHero />

      <section className="border-b border-line bg-paper">
        <div className="mx-auto grid max-w-shell divide-y divide-line px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <QuickEntry href="/find" index="01" title="Identify a system" body="Find the model, motor or controller you already have." />
          <QuickEntry href="/configure" index="02" title="Configure a door" body="Build a clear door specification before you request a quote." />
          <QuickEntry href="/manuals" index="03" title="Open the manual" body="Search installation, programming and troubleshooting documents." />
          <QuickEntry
            href="/compliance"
            index="04"
            title="Get the compliance pack"
            body="Prepare a professional safety and compliance document pack for your next client."
            className="sm:!border-l-0 sm:pl-0"
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------
          How it works
          --------------------------------------------------------------- */}
      <section className="mx-auto max-w-shell px-4 py-16 sm:py-20">
        <SectionHeading eyebrow="How it works" title="Post the job. Compare the quotes. Pick who does it." />
        <ol className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: '01',
              title: 'Describe the work',
              body: 'What the door is doing, where you are, when suits. Photos if you have them.',
            },
            {
              step: '02',
              title: 'Technicians quote',
              body: 'Technicians covering your postcode see the job and send you a price with what it covers.',
            },
            {
              step: '03',
              title: 'You choose',
              body: 'Compare prices, ratings and what each one included. Nobody gets your number until you pick.',
            },
            {
              step: '04',
              title: 'Track it to done',
               body: 'Booked, started, finished. The job keeps its own history, and you review the work at the end.',
            },
          ].map((item, index) => (
            <RevealCard key={item.step} delay={index * 0.06}>
              <div className="border-t-2 border-graphite pt-4">
                <p className="font-code text-micro text-zinc-deep">{item.step}</p>
                <p className="mt-2 font-medium text-graphite">{item.title}</p>
                <p className="mt-1.5 text-sm text-zinc-deep">{item.body}</p>
              </div>
            </RevealCard>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------
          The three things Doorlink is
          --------------------------------------------------------------- */}
      <section className="border-y border-line bg-rail">
        <div className="mx-auto max-w-shell px-4 py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-3 lg:gap-12">
            <Pillar
              href="/request-technician"
              eyebrow="Marketplace"
              title="Find a professional"
              cta="Post a job"
            >
              Garage door repairs, gate automation, motor replacement, remote programming, roller shutters,
              emergency callouts.{' '}
              {figures.available && figures.services > 0 && (
                <>{figures.services} service categories, and technicians quote against your postcode.</>
              )}
            </Pillar>

            <Pillar href="/configure" eyebrow="Products" title="Explore door systems" cta="Design a door">
              Pick a door type, size, colour and finish and watch it change on the house, then send the
              specification to technicians for a price. Or work out which door, motor or controller you already
              have with{' '}
              <Link href="/find" className="font-medium text-signal hover:text-signal-hover">
                Find your part
              </Link>
              .
            </Pillar>

            <Pillar href="/manuals" eyebrow="Knowledge" title="User manuals" cta="Search the library">
              Installation manuals, programming guides, wiring diagrams and troubleshooting documents,
              searchable by the text inside them, not just their titles.{' '}
              {figures.available && figures.manuals > 0 && (
                <>
                  {figures.manuals} documents from {figures.manufacturers} manufacturers so far, each labelled
                  with where it came from.
                </>
              )}
            </Pillar>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Why Doorlink
          --------------------------------------------------------------- */}
      <section className="mx-auto max-w-shell px-4 py-16 sm:py-20">
        <SectionHeading eyebrow="Why Doorlink" title="Built the way this trade actually works." />
        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          <Reason title="Your number stays yours">
            The job board shows the work and the suburb. Contact details are exchanged at the moment you agree
            to work together, and not before.
          </Reason>
          <Reason title="Prices you can check">
            {figures.commissionBps === null
              ? 'Doorlink takes a percentage of a completed job, deducted from the amount the technician quotes. The technician sees their share before they send it.'
               : `Doorlink takes ${formatCommissionRate(figures.commissionBps)} of a completed job, deducted from the amount the technician quotes, and they see exactly what they receive before they send it.`}
          </Reason>
          <Reason title="Reviews that mean something">
            A review can only be written by the customer of a job that actually reached completion on Doorlink.
            There is no other way for one to exist.
          </Reason>
          <Reason title="Verification that says what it is">
            A verified badge means a Doorlink admin matched a technician&apos;s licence and insurance details to
            their account. It does not mean Doorlink is a licensing authority, and the profile says so.
          </Reason>
          <Reason title="Documents with their provenance attached">
            Every manual is labelled with whether it is the manufacturer&apos;s own file, a third-party
            write-up, or something we cannot vouch for. A technician relying on it sees that first.
          </Reason>
          <Reason title="Made for a phone in a driveway">
             Large touch targets, a bottom tab bar, and an installable app, because this gets used outdoors,
            often one-handed, often with gloves on.
          </Reason>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Subscription
          --------------------------------------------------------------- */}
      {figures.plans.length > 0 && (
        <section className="border-y border-line bg-rail">
          <div className="mx-auto max-w-shell px-4 py-16 sm:py-20">
            <SectionHeading eyebrow="Doorlink app" title="Plans" />
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {figures.plans.map((plan) => (
                <div key={plan.id} className="rounded-md border border-line bg-paper p-6">
                  <p className="text-sm font-medium text-graphite">{plan.name}</p>
                  <p className="mt-3 text-2xl font-semibold text-graphite">
                    {plan.priceCents === null ? (
                      <span className="text-base font-normal text-zinc-deep">Pricing not set</span>
                    ) : (
                      <>
                        {formatMoney(plan.priceCents, plan.currency)}
                        <span className="text-base font-normal text-zinc-deep">
                          {INTERVAL_SUFFIX[plan.interval]}
                        </span>
                      </>
                    )}
                  </p>
                  {plan.description && <p className="mt-2 text-sm text-zinc-deep">{plan.description}</p>}
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-prose text-sm text-zinc-deep">
              Subscriptions are not live. No payment provider is connected, so nothing here can be bought yet,
               and a plan with no price is a plan whose price has not been decided. It is not a number we are
              hiding.
            </p>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------
          Get help
          --------------------------------------------------------------- */}
      <section className="mx-auto max-w-shell px-4 py-16 sm:py-20">
        <SectionHeading eyebrow="Get help" title="Not sure where to start?" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <HelpCard
            href="/find/unknown"
            title="I don't know what I have"
            body="Answer a few questions about what you can see on the door and we'll narrow it down."
          />
          <HelpCard
            href="/marketplace"
            title="I need a part"
            body="Browse parts listed by other people on Doorlink, or check what's compatible with your model."
          />
          <HelpCard
            href="/support"
            title="Something else"
            body="Open a support ticket and a person will read it."
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Closing CTA
          --------------------------------------------------------------- */}
      <section className="border-t border-line bg-graphite">
        <div className="mx-auto flex max-w-shell flex-col items-start gap-6 px-4 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-prose">
            <h2 className="text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
              Tell us what your door is doing.
            </h2>
            <p className="mt-2 text-paper/70">
              It is free to post a job, and you only pay if you hire someone.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/request-technician"
              className="inline-flex h-12 items-center rounded bg-paper px-6 text-sm font-medium text-graphite transition-colors hover:bg-rail"
            >
              Post a job
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 items-center rounded border border-paper/25 px-6 text-sm font-medium text-paper transition-colors hover:bg-paper/10"
            >
              Work on Doorlink
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-prose">
      <p className="text-micro font-semibold uppercase tracking-[0.18em] text-zinc-deep">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">{title}</h2>
    </div>
  )
}

function Pillar({
  href,
  eyebrow,
  title,
  cta,
  children,
}: {
  href: string
  eyebrow: string
  title: string
  cta: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-start">
      <p className="text-micro font-semibold uppercase tracking-[0.18em] text-zinc-deep">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-graphite">{title}</h3>
      <p className="mt-3 text-graphite-soft">{children}</p>
      <Link href={href} className="mt-4 text-sm font-medium text-signal hover:text-signal-hover">
        {cta} →
      </Link>
    </div>
  )
}

function Reason({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-line pl-4">
      <p className="font-medium text-graphite">{title}</p>
      <p className="mt-1.5 text-sm text-zinc-deep">{children}</p>
    </div>
  )
}

function HelpCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-line bg-paper p-5 transition-colors hover:border-signal"
    >
      <p className="font-medium text-graphite">{title}</p>
      <p className="mt-1.5 text-sm text-zinc-deep">{body}</p>
    </Link>
  )
}

function QuickEntry({
  href,
  index,
  title,
  body,
  className,
}: {
  href: string
  index: string
  title: string
  body: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn('group flex gap-4 px-0 py-5 sm:px-6 sm:py-6 first:sm:pl-0 last:sm:pr-0', className)}
    >
      <span className="font-code text-micro text-zinc-deep">{index}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-medium text-graphite">
          {title}
          <span className="text-signal transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
        </span>
        <span className="mt-1 block text-sm leading-6 text-zinc-deep">{body}</span>
      </span>
    </Link>
  )
}
