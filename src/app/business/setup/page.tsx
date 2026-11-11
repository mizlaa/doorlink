import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidAbn } from '@/lib/business-details'
import { loadBrand } from '@/lib/branding/brand'
import { businessPage } from '@/lib/business/guard'
import { prisma } from '@/lib/prisma'
import { Notice, PageHeader, PrimaryLink } from '@/components/business/ui'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Set up your business' }

/**
 * The once-only checklist after signing up: the four things customers and
 * invoices need. Each step links to the one screen that sets it.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ logo?: string }> }) {
  const gate = await businessPage('OWNER', '/business/setup')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const brand = await loadBrand(business)
  const areas = await prisma.businessServiceArea.count({ where: { profileId: business.businessId } })
  const settingsTouched = await prisma.auditLog.count({ where: { action: 'business.settings.update', entityId: business.businessId } })
  const steps = [
    { done: !!brand.name && !!brand.phone && !!brand.email, title: 'Business details', detail: brand.abn && isValidAbn(brand.abn) ? `${brand.name} · ABN ${brand.abn}` : 'Trading name, ABN, phone and email', href: '/pricing/business' },
    { done: areas > 0, title: 'Where you work', detail: areas > 0 ? `${areas} postcode range${areas === 1 ? '' : 's'}` : 'The postcodes you service. Customers there will see you.', href: '/pricing/profile' },
    { done: settingsTouched > 0, title: 'GST and invoice terms', detail: settingsTouched > 0 ? `${brand.gstRegistered ? 'GST registered' : 'Not registered for GST'} · ${brand.invoiceTermsDays === 0 ? 'due on receipt' : `${brand.invoiceTermsDays} days`}` : 'Whether you charge GST, payment terms and how to pay you', href: '/business/settings' },
    { done: !!brand.logoVersionId, title: 'Logo', detail: brand.logoVersionId ? 'Done. It’s on your invoices and profile.' : 'Upload yours, or create one in a minute', href: '/business/settings/logo?next=setup' },
  ]
  const next = steps.find((s) => !s.done)
  const saved = (await searchParams).logo === 'saved'
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Set up your business" subtitle="Do this once. Your brand goes on your profile, quotes, invoices and receipts." />
      {saved && (
        <div className="mb-4">
          <Notice tone="ok">Logo saved.</Notice>
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Link href={step.href} className="flex items-center gap-4 rounded-lg border border-line bg-rail p-4 hover:border-signal">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.done ? 'bg-good text-paper' : 'border border-line bg-paper text-graphite'}`} aria-hidden="true">
                {step.done ? '✓' : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-graphite">{step.title}</span>
                <span className="block text-sm text-graphite-soft">{step.detail}</span>
              </span>
              <span className="text-sm font-medium text-signal">{step.done ? 'Edit' : 'Set up'}</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-6">
        {next ? <PrimaryLink href={next.href} className="h-12 w-full">Next: {next.title}</PrimaryLink> : <PrimaryLink href="/business" className="h-12 w-full">All set. Go to your business</PrimaryLink>}
      </div>
    </div>
  )
}
