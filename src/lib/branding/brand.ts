import 'server-only'

import { createHash } from 'node:crypto'
import type { BusinessContext } from '@/lib/business/access'
import { loadBusinessDetails } from '@/lib/pricing/business'
import { prisma } from '@/lib/prisma'
import type { LogoSource } from '@/lib/invoices/pdf'
import { logoSvg, parseLogoDesign, type LogoDesign } from './logo'

/**
 * A business's brand: its details, colours and logo, read in one place by
 * invoices, receipts, the portal and the marketplace. Logos are kept as
 * immutable versions, so an invoice can keep pointing at the logo it was
 * issued with after the business changes its mind.
 */

export const DEFAULT_BRAND_COLOUR = '#17324D'
export const BUILT_LOGO_TYPE = 'application/x-doorlink-logo'

export interface Brand {
  name: string
  abn: string | null
  addressLine: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  phone: string | null
  email: string | null
  brandColour: string
  accentColour: string
  gstRegistered: boolean
  invoiceTermsDays: number
  invoiceFooter: string | null
  logoVersionId: string | null
}

export async function loadBrand(context: Pick<BusinessContext, 'key' | 'profile' | 'name'>): Promise<Brand> {
  const details = await loadBusinessDetails(context.key)
  const p = context.profile
  return {
    name: details?.businessName?.trim() || context.name,
    abn: details?.abn || null,
    addressLine: p.addressLine,
    suburb: details?.suburb || null,
    state: details?.state || null,
    postcode: details?.postcode || null,
    phone: details?.phone || null,
    email: details?.email || null,
    brandColour: p.brandColour ?? DEFAULT_BRAND_COLOUR,
    accentColour: p.accentColour ?? '#1769D2',
    gstRegistered: p.gstRegistered,
    invoiceTermsDays: p.invoiceTermsDays,
    invoiceFooter: p.invoiceFooter,
    logoVersionId: p.logoVersionId,
  }
}

/** Stores a logo as a new version (or finds the identical one) and makes it current. */
export async function setCurrentLogo(
  businessId: string,
  logo: { kind: 'image'; contentType: 'image/png' | 'image/jpeg'; bytes: Uint8Array } | { kind: 'design'; design: LogoDesign }
): Promise<string> {
  const sha256 = createHash('sha256')
    .update(logo.kind === 'image' ? logo.bytes : JSON.stringify(logo.design))
    .digest('hex')
  const version = await prisma.businessLogoVersion.upsert({
    where: { businessId_sha256: { businessId, sha256 } },
    update: {},
    create:
      logo.kind === 'image'
        ? { businessId, sha256, contentType: logo.contentType, bytes: Buffer.from(logo.bytes) }
        : { businessId, sha256, contentType: BUILT_LOGO_TYPE, design: logo.design as unknown as object },
  })
  await prisma.businessProfile.update({
    where: { id: businessId },
    data: {
      logoVersionId: version.id,
      logoDesign: logo.kind === 'design' ? (logo.design as unknown as object) : undefined,
      ...(logo.kind === 'design' ? { brandColour: logo.design.primary, accentColour: logo.design.accent } : {}),
    },
  })
  return version.id
}

/** A logo version in the form the PDF renderer takes. */
export async function logoSource(versionId: string | null): Promise<LogoSource> {
  if (!versionId) return null
  const version = await prisma.businessLogoVersion.findUnique({ where: { id: versionId } })
  if (!version) return null
  if (version.contentType === BUILT_LOGO_TYPE) {
    const design = parseLogoDesign(version.design)
    return design ? { kind: 'design', design } : null
  }
  return version.bytes ? { kind: 'image', contentType: version.contentType, bytes: new Uint8Array(version.bytes) } : null
}

/** What /api/logo serves for a version: SVG for a built logo, the image bytes otherwise. */
export async function logoResponseBody(versionId: string): Promise<{ contentType: string; body: Uint8Array | string } | null> {
  const source = await logoSource(versionId)
  if (!source) return null
  if (source.kind === 'design') return { contentType: 'image/svg+xml; charset=utf-8', body: logoSvg(source.design) }
  return { contentType: source.contentType, body: source.bytes }
}

export function logoUrl(versionId: string | null | undefined): string | null {
  return versionId ? `/api/logo/${versionId}` : null
}
