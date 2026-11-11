import type { Metadata } from 'next'
import { loadBrand } from '@/lib/branding/brand'
import { parseLogoDesign } from '@/lib/branding/logo'
import { businessPage } from '@/lib/business/guard'
import { localDateString } from '@/lib/timezone'
import { PageHeader } from '@/components/business/ui'
import { LogoBuilder } from './LogoBuilder'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Create a logo' }

export default async function LogoPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const gate = await businessPage('OWNER', '/business/settings/logo')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const brand = await loadBrand(business)
  const next = (await searchParams).next === 'setup' ? 'setup' : 'settings'
  return (
    <>
      <PageHeader
        title="Create a logo"
        back={next === 'setup' ? { href: '/business/setup', label: 'Set up' } : { href: '/business/settings', label: 'Settings' }}
        subtitle="Start from your name and a garage-door symbol, then adjust it. It’s free and you can change it any time."
      />
      <LogoBuilder
        brand={{
          name: brand.name,
          abn: brand.abn,
          addressLine: brand.addressLine,
          suburb: brand.suburb,
          state: brand.state,
          postcode: brand.postcode,
          phone: brand.phone,
          email: brand.email,
          brandColour: brand.brandColour,
          gstRegistered: brand.gstRegistered,
          invoiceTermsDays: brand.invoiceTermsDays,
          invoiceFooter: brand.invoiceFooter,
        }}
        today={localDateString(new Date(), business.timezone)}
        start={parseLogoDesign(business.profile.logoDesign)}
        next={next}
      />
    </>
  )
}
