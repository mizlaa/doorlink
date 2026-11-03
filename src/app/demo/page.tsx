import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isDemo, DEMO_PAYMENT_NOTE } from '@/lib/demo/mode'
import { DEMO_ACCOUNTS } from '@/lib/demo/accounts'

export const metadata: Metadata = { title: 'Guided tour' }

type Who = 'Customer' | 'Business owner' | 'Super admin'

interface Step {
  title: string
  who: Who
  account: string
  href: string
  linkLabel: string
  note: string
}

const STEPS: Step[] = [
  {
    title: 'Design a door',
    who: 'Customer',
    account: DEMO_ACCOUNTS.customer,
    href: '/configure',
    linkLabel: 'Open the designer',
    note: 'Choose a garage door, gate, fence or shutter, its size and options. The AI photo panel returns a demo image.',
  },
  {
    title: 'Compare free quotes',
    who: 'Customer',
    account: DEMO_ACCOUNTS.customer,
    href: '/configure',
    linkLabel: 'Back to the designer',
    note: 'Press “Compare free quotes”, enter a postcode such as 2150, 2000 or 2750, and see every business that serves it. Try 4000 for a postcode with no coverage.',
  },
  {
    title: 'View a business and its reviews',
    who: 'Customer',
    account: DEMO_ACCOUNTS.customer,
    href: '/businesses/o_demo-org-harbourline#reviews',
    linkLabel: 'Open Harbourline Doors',
    note: 'Prices, coverage, portfolio and reviews. Every review is tagged “Demo review”.',
  },
  {
    title: 'Request a booking',
    who: 'Customer',
    account: DEMO_ACCOUNTS.customer,
    href: '/quotes',
    linkLabel: 'Open your quotes',
    note: 'Pick a quote and request a booking with your site details. Nothing is charged at this step.',
  },
  {
    title: 'The business confirms',
    who: 'Business owner',
    account: DEMO_ACCOUNTS.owner,
    href: '/pricing/quotes',
    linkLabel: 'Open quotes and bookings',
    note: 'The owner confirms the price (an estimate is set here) or declines the booking.',
  },
  {
    title: 'Customer accepts and pays (simulated)',
    who: 'Customer',
    account: DEMO_ACCOUNTS.customer,
    href: '/jobs',
    linkLabel: 'Open your jobs',
    note: `Accept the final price and pay. Demo: the payment is simulated. ${DEMO_PAYMENT_NOTE}.`,
  },
  {
    title: 'Business schedules and posts progress',
    who: 'Business owner',
    account: DEMO_ACCOUNTS.owner,
    href: '/jobs',
    linkLabel: 'Open the job',
    note: 'Book a date, then post progress notes with photos. The customer is told about each update.',
  },
  {
    title: 'Business finishes the work',
    who: 'Business owner',
    account: DEMO_ACCOUNTS.owner,
    href: '/jobs',
    linkLabel: 'Open the job',
    note: 'Mark the job complete. The customer then confirms it, or it completes itself after seven days.',
  },
  {
    title: 'Customer confirms and leaves a review',
    who: 'Customer',
    account: DEMO_ACCOUNTS.customer,
    href: '/jobs',
    linkLabel: 'Open the job',
    note: 'Confirm the work and leave a star rating, detail scores and optional photos.',
  },
  {
    title: 'Business replies to the review',
    who: 'Business owner',
    account: DEMO_ACCOUNTS.owner,
    href: '/jobs',
    linkLabel: 'Open the job',
    note: 'The business can reply once. The reply shows under the review on its public profile.',
  },
  {
    title: 'Admin view',
    who: 'Super admin',
    account: DEMO_ACCOUNTS.admin,
    href: '/admin',
    linkLabel: 'Open the admin area',
    note: 'Approve or suspend businesses, see AI usage and metrics, moderate reviews and resolve disputes. The demo data can be reset here.',
  },
]

export default function DemoTourPage() {
  if (!isDemo()) notFound()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-graphite">Guided tour</h1>
      <p className="mt-2 text-sm text-graphite-soft">
        Eleven steps from design to review. Each step says which account to use. Sign in with the one-click demo accounts
        on the{' '}
        <Link href="/sign-in" className="font-medium text-signal hover:text-signal-hover">
          sign-in page
        </Link>
        . Demo only: no real businesses, prices, reviews or payments.
      </p>

      <ol className="mt-8 flex flex-col gap-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-lg border border-line bg-paper p-4">
            <div className="flex items-start gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rail text-sm font-semibold text-graphite">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-medium text-graphite">{step.title}</h2>
                <p className="mt-1 text-sm text-graphite-soft">{step.note}</p>
                <p className="mt-2 text-micro text-zinc-deep">
                  Sign in as: {step.who} ({step.account})
                </p>
                <Link href={step.href} className="mt-2 inline-block text-sm font-medium text-signal hover:text-signal-hover">
                  {step.linkLabel} →
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
