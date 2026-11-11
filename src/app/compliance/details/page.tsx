import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { completeness, expiryWarnings } from '@/lib/compliance/profile'
import { legislationFor } from '@/lib/compliance/jurisdiction'
import { ComplianceDetailsForm, LogoForm } from './DetailsForms'

export const metadata: Metadata = { title: 'Your compliance details' }

export default async function ComplianceDetailsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  let profile
  try {
    profile = await prisma.complianceProfile.findUnique({ where: { userId: session.userId } })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <NotConnected feature="Your compliance details" reason="Can't reach the database right now." />
      </div>
    )
  }

  const status = completeness(profile)
  const warnings = expiryWarnings(profile)
  const legislation = legislationFor(profile?.state ?? null)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Your compliance details</h1>
        <p className="max-w-prose text-graphite-soft">
          Entered once and repeated on every document in the pack. Saving keeps whatever you have filled in.
          you do not have to complete it in one sitting.
        </p>
        <p className="text-sm text-graphite-soft">
          <span className="font-medium text-graphite">
            {status.filled} of {status.total}
          </span>{' '}
          required fields filled.{' '}
          {status.canIssue ? (
            <Link href="/compliance/pack" className="font-medium text-signal hover:text-signal-hover">
              Open your pack →
            </Link>
          ) : (
            'The pack can be issued once all of them are.'
          )}
        </p>
      </header>

      {!status.canIssue && (
        <Panel className="border-caution/30 bg-caution-tint">
          <PanelBody>
            <h2 className="text-sm font-semibold text-caution">Still needed before a document can be issued</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-graphite">
              {status.missingRequired.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      )}

      {warnings.length > 0 && (
        <Panel className="border-bad/30 bg-bad/5">
          <PanelBody>
            <h2 className="text-sm font-semibold text-bad">Insurance needs attention</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-graphite">
              {warnings.map((warning) => (
                <li key={warning.label}>
                  {warning.label} {warning.expired ? 'expired' : 'expires'} on{' '}
                  {warning.date.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}
                  {warning.expired ? '.' : `, ${warning.daysRemaining} days away.`}
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      )}

      {legislation.gap && (
        <Panel className="border-caution/30 bg-caution-tint">
          <PanelBody>
            <h2 className="text-sm font-semibold text-caution">Legislation for your state</h2>
            <p className="mt-1 max-w-prose text-sm text-graphite">{legislation.gap}</p>
          </PanelBody>
        </Panel>
      )}

      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Your logo</h2>
        <LogoForm logoDataUri={profile?.logoDataUri ?? null} />
      </section>

      <ComplianceDetailsForm profile={profile as Record<string, unknown> | null} />
    </div>
  )
}
