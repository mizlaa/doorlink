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
import { doorPreviewAvailable } from '@/lib/configurator/preview'
import { generateDoorPreviewFromPhoto } from '@/lib/configurator/openai-preview'
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
  balance?: number
}

const PREVIEW_PRODUCT_TYPES: ProductType[] = ['sectional', 'roller', 'tilt']

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

export async function generateDoorPreviewAction(
  _prevState: PreviewActionState,
  formData: FormData
): Promise<PreviewActionState> {
  if (!doorPreviewAvailable()) {
    return { error: 'Photo preview is not connected yet.' }
  }

  const session = await getSession()
  if (!session) {
    return { error: 'Sign in to generate a photo preview.' }
  }

  const specRaw = formData.get('spec')
  if (typeof specRaw !== 'string' || specRaw.trim().length < 2) {
    return { error: 'Choose your door options first.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(specRaw)
  } catch {
    return { error: 'That configuration could not be read.' }
  }

  const spec = parseSpec(parsed)
  if (!PREVIEW_PRODUCT_TYPES.includes(spec.productType)) {
    return { error: 'Photo preview is only available for sectional, roller, and tilt doors.' }
  }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a photo of your garage opening.' }
  }

  if (file.size > PREVIEW_IMAGE_MAX_BYTES) {
    return { error: 'That photo is too large. Use a file under 8 MB.' }
  }

  const buffer = await file.arrayBuffer()
  const imageBytes = new Uint8Array(buffer)
  if (!sniffPreviewImageMime(imageBytes)) {
    return { error: 'Use a JPEG, PNG, or WebP photo.' }
  }

  const noteRaw = formData.get('note')
  const note = typeof noteRaw === 'string' ? noteRaw.trim() : ''
  if (previewNoteWordCount(note) > PREVIEW_NOTE_MAX_WORDS) {
    return { error: `Keep the notes to ${PREVIEW_NOTE_MAX_WORDS} words.` }
  }

  const spend = await beginPreviewSpend(session.userId)
  if (!spend.ok) {
    if (spend.reason === 'in_flight') {
      return { error: 'A preview is already generating. Wait for it to finish.' }
    }
    const balance = await getCreditBalance(session.userId)
    return {
      error: `You need ${PREVIEW_CREDIT_COST} credit to generate a preview. Buy more credits below.`,
      balance,
    }
  }

  let result: Awaited<ReturnType<typeof generateDoorPreviewFromPhoto>>
  try {
    result = await generateDoorPreviewFromPhoto({ spec, imageBytes, note })
  } catch (error) {
    await refundPreviewCredit(session.userId, spend.generationId)
    if (isDatabaseUnreachable(error)) {
      return { error: "Can't reach the database right now. Try again in a moment." }
    }
    throw error
  }

  if (!result.ok) {
    if (result.refundCredit) {
      await refundPreviewCredit(session.userId, spend.generationId)
    } else {
      await clearPreviewInFlight(session.userId, spend.generationId)
    }
    const balance = await getCreditBalance(session.userId)
    return { error: result.error, balance }
  }

  await clearPreviewInFlight(session.userId, spend.generationId)
  const balance = await getCreditBalance(session.userId)
  revalidatePath('/configure')
  revalidatePath('/account')
  return { imageDataUrl: result.dataUrl, balance }
}
