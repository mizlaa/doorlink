'use server'

import { revalidatePath } from 'next/cache'
import { Prisma, type PricedProduct } from '@prisma/client'
import { z } from 'zod'
import { getSession, type Session } from '@/lib/auth'
import { canManageBusiness, ensureBusinessProfile } from '@/lib/business/profile'
import { parsePostcodeRanges } from '@/lib/business/coverage'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { mediaUploadsAvailable, newMediaKey, readImageFile, saveMedia } from '@/lib/media'
import { prisma } from '@/lib/prisma'
import { ACCESSORIES } from '@/lib/pricing/accessories'
import { businessKeyFor, encodeBusinessKey, pricingSession, type BusinessKey } from '@/lib/pricing/business'
import { PRICED_PRODUCTS } from '@/lib/pricing/products'
import { parseMoney } from '@/lib/pricing/validation'
import { StorageUnavailableError } from '@/lib/storage'
import { DEPOSIT_CHOICES } from '@/lib/business/deposit'

export type ProfileFormState = { error?: string; ok?: boolean }

/** The business behind the session, if this person may manage it. */
async function manager(): Promise<{ session: Session; key: BusinessKey } | { error: string }> {
  const session = await pricingSession(await getSession())
  if (!session) return { error: 'Sign in with a subscribed business account.' }
  const key = businessKeyFor(session)
  if (!(await canManageBusiness(session, key))) return { error: 'Only the business owner can change this.' }
  return { session, key }
}

async function audit(session: Session, key: BusinessKey, action: string, metadata: Prisma.InputJsonValue = {}) {
  await prisma.auditLog.create({
    data: {
      actorId: session.userId,
      action,
      entityType: 'BusinessProfile',
      entityId: encodeBusinessKey(key),
      metadata,
    },
  })
}

function done(state: ProfileFormState = { ok: true }): ProfileFormState {
  revalidatePath('/pricing', 'layout')
  return state
}

const profileSchema = z.object({
  description: z.string().trim().max(1500, 'Keep the description under 1500 characters.'),
  warranty: z.string().trim().max(300, 'Keep the warranty under 300 characters.'),
  leadTimeDays: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 365), 'Lead time is a number of days, up to 365.'),
  depositPercent: z.coerce
    .number()
    .refine((v) => (DEPOSIT_CHOICES as readonly number[]).includes(v), 'Choose how much is paid when a job is confirmed.'),
})

export async function saveProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const access = await manager()
  if ('error' in access) return { error: access.error }
  const { session, key } = access

  const parsed = profileSchema.safeParse({
    description: formData.get('description') ?? '',
    warranty: formData.get('warranty') ?? '',
    leadTimeDays: formData.get('leadTimeDays') ?? '',
    depositPercent: formData.get('depositPercent') ?? 100,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  const products = formData
    .getAll('products')
    .map(String)
    .filter((p): p is PricedProduct => PRICED_PRODUCTS.some((product) => product.id === p))

  const logo = await readImageFile(formData.get('logo'))
  if (logo && !logo.ok) return { error: logo.error }

  try {
    const profile = await ensureBusinessProfile(key)
    let logoKey: string | undefined
    if (logo?.ok) {
      if (!mediaUploadsAvailable()) return { error: 'Image uploads aren’t connected yet.' }
      logoKey = newMediaKey('logos', profile.id, logo.type)
      await saveMedia(logoKey, logo.bytes, logo.type)
    }
    await prisma.businessProfile.update({
      where: { id: profile.id },
      data: {
        description: parsed.data.description || null,
        warranty: parsed.data.warranty || null,
        leadTimeDays: parsed.data.leadTimeDays === '' ? null : Number(parsed.data.leadTimeDays),
        depositPercent: parsed.data.depositPercent,
        products,
        ...(logoKey ? { logoKey } : {}),
      },
    })
    await audit(session, key, 'business.profile.update', { products, depositPercent: parsed.data.depositPercent })
  } catch (error) {
    if (error instanceof StorageUnavailableError) return { error: 'The logo couldn’t be stored. Try again later.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }
  return done()
}

/**
 * Replaces the business's service areas. Each row is a list of postcodes
 * and ranges with one travel fee (blank or 0 for none).
 */
export async function saveCoverageAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const access = await manager()
  if ('error' in access) return { error: access.error }
  const { session, key } = access

  const rows: Array<{ fromPostcode: string; toPostcode: string; travelFeeCents: number }> = []
  for (let i = 0; i < 20; i++) {
    const text = String(formData.get(`area_${i}`) ?? '').trim()
    const feeText = String(formData.get(`fee_${i}`) ?? '').trim()
    if (!text) continue
    const parsed = parsePostcodeRanges(text)
    if (!parsed.ok) return { error: parsed.error }
    const fee = feeText === '' ? 0 : parseMoney(feeText)
    if (fee === null || fee > 1_000_000) return { error: `Enter the travel fee for “${text}” in dollars, or leave it blank.` }
    rows.push(...parsed.areas.map((area) => ({ ...area, travelFeeCents: fee })))
  }
  if (rows.length === 0) return { error: 'Enter at least one postcode or range you service.' }
  if (rows.length > 300) return { error: 'That is too many ranges. Combine them into fewer.' }

  try {
    const profile = await ensureBusinessProfile(key)
    await prisma.$transaction([
      prisma.businessServiceArea.deleteMany({ where: { profileId: profile.id } }),
      prisma.businessServiceArea.createMany({ data: rows.map((row) => ({ ...row, profileId: profile.id })) }),
    ])
    await audit(session, key, 'business.coverage.update', { ranges: rows.length })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }
  return done()
}

export async function saveAccessoriesAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const access = await manager()
  if ('error' in access) return { error: access.error }
  const { session, key } = access

  const priced: Array<{ accessory: string; priceCents: number; gst: 'INCLUSIVE' | 'EXCLUSIVE' }> = []
  for (const accessory of ACCESSORIES) {
    const text = String(formData.get(`price_${accessory.id}`) ?? '').trim()
    if (!text) continue
    const priceCents = parseMoney(text)
    if (priceCents === null || priceCents <= 0 || priceCents > 10_000_000)
      return { error: `Enter a price for ${accessory.label.toLowerCase()} in dollars, or leave it blank.` }
    const gst = formData.get(`gst_${accessory.id}`) === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'INCLUSIVE'
    priced.push({ accessory: accessory.id, priceCents, gst })
  }

  try {
    const profile = await ensureBusinessProfile(key)
    await prisma.$transaction([
      prisma.businessAccessory.deleteMany({ where: { profileId: profile.id } }),
      prisma.businessAccessory.createMany({ data: priced.map((row) => ({ ...row, profileId: profile.id })) }),
    ])
    await audit(session, key, 'business.accessories.update', { priced: priced.length })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }
  return done()
}

export async function addPortfolioAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const access = await manager()
  if ('error' in access) return { error: access.error }
  const { session, key } = access

  const image = await readImageFile(formData.get('image'))
  if (!image) return { error: 'Choose a photo of a finished installation.' }
  if (!image.ok) return { error: image.error }
  const caption = String(formData.get('caption') ?? '').trim().slice(0, 200)
  if (!mediaUploadsAvailable()) return { error: 'Image uploads aren’t connected yet.' }

  try {
    const profile = await ensureBusinessProfile(key)
    if ((await prisma.businessPortfolioItem.count({ where: { profileId: profile.id } })) >= 30)
      return { error: 'Your portfolio holds up to 30 photos. Remove one first.' }
    const imageKey = newMediaKey('portfolio', profile.id, image.type)
    await saveMedia(imageKey, image.bytes, image.type)
    await prisma.businessPortfolioItem.create({ data: { profileId: profile.id, imageKey, caption: caption || null } })
    await audit(session, key, 'business.portfolio.add')
  } catch (error) {
    if (error instanceof StorageUnavailableError) return { error: 'The photo couldn’t be stored. Try again later.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }
  return done()
}

export async function removePortfolioAction(formData: FormData): Promise<void> {
  const access = await manager()
  if ('error' in access) return
  const profile = await ensureBusinessProfile(access.key)
  await prisma.businessPortfolioItem.deleteMany({
    where: { id: String(formData.get('id') ?? ''), profileId: profile.id },
  })
  await audit(access.session, access.key, 'business.portfolio.remove')
  revalidatePath('/pricing/profile')
}
