'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { setCurrentLogo } from '@/lib/branding/brand'
import { parseLogoDesign } from '@/lib/branding/logo'
import { businessAction } from '@/lib/business/guard'
import { readImageFile } from '@/lib/media'
import { prisma } from '@/lib/prisma'
import { isAuTimezone } from '@/lib/timezone'

export type SettingsState = { error?: string; ok?: boolean; message?: string }

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const MAX_LOGO_BYTES = 2 * 1024 * 1024

function refresh() {
  revalidatePath('/business', 'layout')
  revalidatePath('/businesses', 'layout')
}

/** GST, invoice terms, street address, time zone and what the public profile shows. Owner only. */
export async function saveSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  const { business, session } = gate
  const terms = Number(text(form, 'invoiceTermsDays'))
  if (!Number.isInteger(terms) || terms < 0 || terms > 90) return { error: 'Payment terms are a number of days from 0 (on receipt) to 90.' }
  const timezone = text(form, 'timezone')
  if (!isAuTimezone(timezone)) return { error: 'Choose your time zone.' }
  const addressLine = text(form, 'addressLine')
  if (addressLine.length > 120) return { error: 'Keep the street address under 120 characters.' }
  const footer = text(form, 'invoiceFooter')
  if (footer.length > 600) return { error: 'Keep the invoice footer under 600 characters.' }
  const gstRegistered = form.get('gstRegistered') === 'yes'
  const data = {
    gstRegistered,
    invoiceTermsDays: terms,
    timezone,
    addressLine: addressLine || null,
    invoiceFooter: footer || null,
    showPhone: form.get('showPhone') === 'on',
    showEmail: form.get('showEmail') === 'on',
    showAbn: form.get('showAbn') === 'on',
    showAddress: form.get('showAddress') === 'on',
  }
  await prisma.businessProfile.update({ where: { id: business.businessId }, data })
  await audit({ actorId: session.userId, action: 'business.settings.update', entityType: 'BusinessProfile', entityId: business.businessId, metadata: { gstRegistered, invoiceTermsDays: terms, timezone } })
  refresh()
  return { ok: true, message: 'Saved. New invoices use these settings; issued ones keep what they were issued with.' }
}

/**
 * A logo file. Only real PNG or JPEG images (checked by their bytes, not
 * their name), up to 2 MB. Stored as a new version so issued invoices keep
 * the logo they went out with.
 */
export async function uploadLogoAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  const file = await readImageFile(form.get('logo'))
  if (!file) return { error: 'Choose an image file.' }
  if (!file.ok) return { error: file.error }
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') return { error: 'Use a PNG or JPEG logo. (Invoices and PDFs can’t use WebP.)' }
  if (file.bytes.byteLength > MAX_LOGO_BYTES) return { error: 'Logos must be under 2 MB.' }
  const versionId = await setCurrentLogo(gate.business.businessId, { kind: 'image', contentType: file.type, bytes: file.bytes })
  await audit({ actorId: gate.session.userId, action: 'business.logo.upload', entityType: 'BusinessProfile', entityId: gate.business.businessId, metadata: { versionId, bytes: file.bytes.byteLength } })
  refresh()
  return { ok: true, message: 'Logo saved.' }
}

/** A logo made in the builder. The choices are validated; the SVG is drawn by us, never uploaded. */
export async function saveBuiltLogoAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('design') ?? ''))
  } catch {
    return { error: 'Choose a design first.' }
  }
  const design = parseLogoDesign(raw)
  if (!design) return { error: 'That design isn’t complete. Check the name and colours.' }
  const versionId = await setCurrentLogo(gate.business.businessId, { kind: 'design', design })
  await audit({ actorId: gate.session.userId, action: 'business.logo.build', entityType: 'BusinessProfile', entityId: gate.business.businessId, metadata: { versionId, template: design.template, symbol: design.symbol } })
  refresh()
  redirect(`${String(form.get('next') ?? '') === 'setup' ? '/business/setup' : '/business/settings'}?logo=saved`)
}

export async function removeLogoAction(_prev: SettingsState): Promise<SettingsState> {
  const gate = await businessAction('OWNER')
  if (!gate.ok) return { error: gate.error }
  await prisma.businessProfile.update({ where: { id: gate.business.businessId }, data: { logoVersionId: null } })
  await audit({ actorId: gate.session.userId, action: 'business.logo.remove', entityType: 'BusinessProfile', entityId: gate.business.businessId })
  refresh()
  return { ok: true, message: 'Logo removed. Issued invoices keep theirs.' }
}
