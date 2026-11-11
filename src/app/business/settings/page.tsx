import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidAbn } from '@/lib/business-details'
import { loadBrand, logoUrl } from '@/lib/branding/brand'
import { businessPage } from '@/lib/business/guard'
import { sampleSnapshot } from '@/lib/invoices/sample'
import { prisma } from '@/lib/prisma'
import { localDateString } from '@/lib/timezone'
import { InvoiceDocument } from '@/components/invoices/InvoiceDocument'
import { Card, Notice, PageHeader, PrimaryLink, SectionTitle } from '@/components/business/ui'
import { LogoUploadForm, SettingsForm } from './SettingsForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Business settings' }

/**
 * The brand, set once and reused everywhere: marketplace profile, quotes,
 * invoices, receipts and the customer portal.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ logo?: string }> }) {
  const gate = await businessPage('OWNER', '/business/settings')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const brand = await loadBrand(business)
  const areas = await prisma.businessServiceArea.count({ where: { profileId: business.businessId } })
  const logo = logoUrl(brand.logoVersionId)
  const abnValid = !!brand.abn && isValidAbn(brand.abn)
  const saved = (await searchParams).logo === 'saved'

  return (
    <>
      <PageHeader title="Settings" subtitle="Set your brand once. It goes on your profile, quotes, invoices, receipts and customer portal." />
      {saved && (
        <div className="mb-5">
          <Notice tone="ok">Logo saved. Invoices you issue from now on carry it.</Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle>Logo</SectionTitle>
            <div className="mb-4 flex min-h-24 items-center justify-center rounded border border-dashed border-line bg-white p-4">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- the business's own logo, served by version
                <img src={logo} alt={`${brand.name} logo`} className="max-h-20 max-w-full object-contain" />
              ) : (
                <p className="text-sm text-zinc-deep">No logo yet. Invoices show your business name instead.</p>
              )}
            </div>
            <PrimaryLink href="/business/settings/logo" className="mb-4 w-full">
              {logo ? 'Create a new logo' : 'Create a logo'}
            </PrimaryLink>
            <LogoUploadForm hasLogo={!!logo} />
          </Card>

          <Card>
            <SectionTitle>Business details</SectionTitle>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-zinc-deep">Trading name</dt>
              <dd className="text-graphite">{brand.name}</dd>
              <dt className="text-zinc-deep">ABN</dt>
              <dd className="text-graphite">{brand.abn || <span className="text-caution">Not added</span>}</dd>
              <dt className="text-zinc-deep">Phone</dt>
              <dd className="text-graphite">{brand.phone || '—'}</dd>
              <dt className="text-zinc-deep">Email</dt>
              <dd className="break-all text-graphite">{brand.email || '—'}</dd>
              <dt className="text-zinc-deep">Based in</dt>
              <dd className="text-graphite">{[brand.suburb, brand.state, brand.postcode].filter(Boolean).join(' ') || '—'}</dd>
              <dt className="text-zinc-deep">Service areas</dt>
              <dd className="text-graphite">{areas > 0 ? `${areas} postcode range${areas === 1 ? '' : 's'}` : <span className="text-caution">None yet: you won’t appear to customers</span>}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
              <Link href="/pricing/business" className="text-signal hover:text-signal-hover">
                Edit name, ABN and contact
              </Link>
              <Link href="/pricing/profile" className="text-signal hover:text-signal-hover">
                Edit service areas
              </Link>
            </div>
          </Card>

          <Card>
            <SectionTitle>Invoicing and profile</SectionTitle>
            <SettingsForm
              abnValid={abnValid}
              values={{
                gstRegistered: business.profile.gstRegistered,
                invoiceTermsDays: business.profile.invoiceTermsDays,
                timezone: business.profile.timezone,
                addressLine: business.profile.addressLine ?? '',
                invoiceFooter: business.profile.invoiceFooter ?? '',
                showPhone: business.profile.showPhone,
                showEmail: business.profile.showEmail,
                showAbn: business.profile.showAbn,
                showAddress: business.profile.showAddress,
              }}
            />
          </Card>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">Sample invoice in your brand</p>
          <InvoiceDocument snapshot={sampleSnapshot(brand, localDateString(new Date(), business.timezone))} logoUrl={logo} />
        </div>
      </div>
    </>
  )
}
