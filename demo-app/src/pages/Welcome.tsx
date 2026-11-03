import Link from 'next/link'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { useDemo } from '../demo/store'
import { SignInPrompt } from './shared'

const HEADING: Record<string, string> = {
  CUSTOMER: 'Getting started',
  TECHNICIAN: 'Setting up your trade profile',
  SUPPLIER: 'Setting up your shop',
  MANUFACTURER: 'Your manufacturer account',
  ADMIN: 'Your queues',
}

interface Step {
  key: string
  title: string
  description: string
  href: string
  cta: string
  done: boolean
  optional?: boolean
}

// src/app/welcome/page.tsx: the onboarding checklist, counted from the demo account.
export function WelcomePage() {
  const session = useDemo((s) => s.session)
  const comparisons = useDemo((s) => s.comparisons)
  const jobs = useDemo((s) => s.jobs)
  const savedDesigns = useDemo((s) => s.savedDesigns)
  if (!session) return <SignInPrompt next="/welcome" />

  const customer: Step[] = [
    { key: 'design', title: 'Design your door, gate or shutter', description: 'See it in 3D, then save it to your account.', href: '/configure', cta: 'Open the designer', done: savedDesigns.length > 0 },
    { key: 'compare', title: 'Compare free quotes', description: 'Every business that serves your postcode, priced from their own rules.', href: '/configure', cta: 'Get instant quotes', done: comparisons.some((c) => c.customerId === session.userId) },
    { key: 'book', title: 'Book a business', description: 'Nothing is charged until you accept the final price.', href: '/quotes', cta: 'Open your quotes', done: jobs.some((j) => j.customerId === session.userId) },
    { key: 'contact', title: 'Add a phone number', description: 'Only shared with a business once you book them.', href: '/account', cta: 'Open your account', done: false, optional: true },
  ]
  const business: Step[] = [
    { key: 'details', title: 'Business details', description: 'Name, ABN, phone and where quote alerts go.', href: '/pricing/business', cta: 'Check details', done: true },
    { key: 'prices', title: 'Set your automated prices', description: 'Customers get an instant quote from your own rules.', href: '/pricing', cta: 'Open automated pricing', done: true },
    { key: 'profile', title: 'Profile and coverage', description: 'Logo, description, postcodes you cover and travel fees.', href: '/pricing/profile', cta: 'Edit profile', done: true },
    { key: 'jobs', title: 'Quote on local jobs', description: 'Customers post jobs; you send a price and a short message.', href: '/leads', cta: 'Open the job board', done: false },
  ]
  const steps = session.role === 'CUSTOMER' ? customer : business
  const done = steps.filter((s) => s.done).length

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-graphite">{HEADING[session.role]}</h1>
        <p className="max-w-prose text-sm text-zinc-deep">
          {session.role === 'CUSTOMER'
            ? 'Design what you want, compare free quotes from local businesses, and book the one you choose.'
            : 'Your demo business is set up with prices, coverage and reviews. Here is what each part does.'}
        </p>
        <p className="text-sm text-graphite-soft">
          <span className="font-medium text-graphite">
            {done} of {steps.length}
          </span>{' '}
          done. Each item is checked against your demo account.
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step.key}>
            <Panel className={step.done ? 'border-line/70' : undefined}>
              <PanelBody className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                {step.done ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-good/10 text-good" aria-label="Done">
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
                      <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-sm font-medium text-graphite-soft">
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={step.done ? 'font-medium text-graphite-soft' : 'font-medium text-graphite'}>{step.title}</h2>
                    {step.optional && !step.done && <Badge tone="neutral">Optional</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-zinc-deep">{step.description}</p>
                  <Link href={step.href} className="mt-3 inline-flex text-sm font-medium text-signal hover:text-signal-hover">
                    {step.cta}
                    <span aria-hidden="true"> →</span>
                  </Link>
                </div>
              </PanelBody>
            </Panel>
          </li>
        ))}
      </ol>

      <footer className="border-t border-line pt-6">
        <p className="text-sm text-zinc-deep">
          You can leave this and come back.{' '}
          <Link href="/account" className="font-medium text-signal hover:text-signal-hover">
            Go to your account
          </Link>
          .
        </p>
      </footer>
    </div>
  )
}
