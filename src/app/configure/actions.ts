'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requireSession, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { parseSpec, type ProductType } from '@/lib/configurator/options'
import { makeReference } from '@/lib/reference'
import { generateDesignImage } from '@/lib/ai/generate'
import { aiImagesAvailable } from '@/lib/ai/design-image'
import { PREVIEW_IMAGE_MAX_BYTES, sniffPreviewImageMime } from '@/lib/configurator/preview-image-mime'
import { PREVIEW_NOTE_MAX_WORDS, previewNoteWordCount } from '@/lib/configurator/preview-prompt'
import {
  beginPreviewSpend,
  clearPreviewInFlight,
  getCreditBalance,
  refundPreviewCredit,
} from '@/lib/credits/credits'
import { PREVIEW_CREDIT_COST } from '@/lib/credits/constants'
import {
  requirePaymentProvider,
  subscriptionCheckoutAvailable,
} from '@/lib/payments'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export type ConfigurationActionState = { error?: string; savedId?: string }

export type PreviewActionState = {
  error?: string
  imageDataUrl?: string
  cached?: boolean
}

const schema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(120),
  spec: z.string().trim().min(2),
})

const packCodeSchema = z.string().trim().min(1)

export async function saveConfigurationAction(
  _prevState: ConfigurationActionState,
  formData: FormData
): Promise<ConfigurationActionState> {
  let userId: string
  try {
    userId = requireSession(await getSession()).userId
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = schema.safeParse({ name: formData.get('name'), spec: formData.get('spec') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  let raw: unknown
  try {
    raw = JSON.parse(parsed.data.spec)
  } catch {
    return { error: 'That configuration could not be read.' }
  }

  const spec = parseSpec(raw)

  try {
    const saved = await prisma.doorConfiguration.create({
      data: {
        userId,
        name: parsed.data.name,
        spec: spec as unknown as object,
        shareSlug: makeReference('CFG').toLowerCase(),
      },
    })
    revalidatePath('/saved')
    return { savedId: saved.id }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }
}

export async function startCreditPackCheckout(packCode: string): Promise<void> {
  if (!subscriptionCheckoutAvailable()) {
    throw new Error('Buying credits is not connected yet.')
  }

  const session = await getSession()
  if (!session) redirect('/sign-in?next=/configure')

  const parsed = packCodeSchema.safeParse(packCode)
  if (!parsed.success) throw new Error('Choose a credit pack.')

  const pack = await prisma.creditPack.findFirst({
    where: { code: parsed.data, isActive: true },
  })
  if (!pack) throw new Error('That credit pack is not available.')

  const provider = requirePaymentProvider('buy preview credits')
  const result = await provider.createCreditPackCheckout({
    userId: session.userId,
    customerEmail: session.email,
    packCode: pack.code,
    packName: pack.name,
    credits: pack.credits,
    priceCents: pack.priceCents,
    currency: pack.currency,
    successUrl: `${siteUrl}/configure?credits=success`,
    cancelUrl: `${siteUrl}/configure?credits=cancel`,
  })

  redirect(result.url)
}

export async function startCreditPackCheckoutAction(formData: FormData): Promise<void> {
  const packCode = formData.get('packCode')
  if (typeof packCode !== 'string') throw new Error('Choose a credit pack.')
  await startCreditPackCheckout(packCode)
}

/**
 * A free AI image of the customer's design, optionally on a photo of
 * their home. Doorlink pays the provider; the customer is never charged.
 * Signing in is required so fair-use limits apply per person (and bots
 * can't run up the bill).
 */
export async function generateDesignImageAction(
  _prevState: PreviewActionState,
  formData: FormData
): Promise<PreviewActionState> {
  if (!aiImagesAvailable()) return { error: 'AI images aren’t switched on yet. Your 3D design still works.' }
  const session = await getSession()
  if (!session) return { error: 'Sign in to generate a free AI image.' }

  let spec
  try {
    spec = parseSpec(JSON.parse(String(formData.get('spec') ?? '')))
  } catch {
    return { error: 'That design could not be read.' }
  }

  const note = String(formData.get('note') ?? '').trim()
  if (previewNoteWordCount(note) > PREVIEW_NOTE_MAX_WORDS) return { error: `Keep the notes to ${PREVIEW_NOTE_MAX_WORDS} words.` }

  let photo: { bytes: Uint8Array; type: string } | null = null
  const file = formData.get('photo')
  if (file instanceof File && file.size > 0) {
    if (file.size > PREVIEW_IMAGE_MAX_BYTES) return { error: 'That photo is too large. Use one under 8 MB.' }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffPreviewImageMime(bytes)
    if (!type) return { error: 'Use a JPEG, PNG or WebP photo.' }
    photo = { bytes, type }
  }

  try {
    const result = await generateDesignImage({ userId: session.userId, spec, photo, note })
    if (!result.ok) return { error: result.error }
    return { imageDataUrl: result.imageUrl, cached: result.cached }
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'Can’t reach the database right now. Try again in a moment.' }
    throw error
  }
}
