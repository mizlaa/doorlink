'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requireSession, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { parseSpec, type ProductType } from '@/lib/configurator/options'
import { makeReference } from '@/lib/reference'
import { doorPreviewAvailable } from '@/lib/configurator/preview'
import { generateDoorPreviewFromPhoto } from '@/lib/configurator/openai-preview'
import { PREVIEW_IMAGE_MAX_BYTES } from '@/lib/configurator/preview-image-mime'

export type ConfigurationActionState = { error?: string; savedId?: string }

export type PreviewActionState = { error?: string; imageDataUrl?: string }

const PREVIEW_PRODUCT_TYPES: ProductType[] = ['sectional', 'roller', 'tilt']

const schema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(120),
  spec: z.string().trim().min(2),
})

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

  // Re-parsed server-side rather than stored as received: the spec came
  // from a form field, and a form field is not a validated document.
  const spec = parseSpec(raw)

  try {
    const saved = await prisma.doorConfiguration.create({
      data: {
        userId,
        name: parsed.data.name,
        spec: spec as unknown as object,
        // A share link that is not guessable from the id, so sharing one
        // configuration does not expose the next person's.
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

export async function generateDoorPreviewAction(
  _prevState: PreviewActionState,
  formData: FormData
): Promise<PreviewActionState> {
  if (!doorPreviewAvailable()) {
    return { error: 'Photo preview is not connected yet.' }
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

  const result = await generateDoorPreviewFromPhoto({ spec, imageBytes })
  if ('error' in result) {
    return { error: result.error }
  }

  return { imageDataUrl: result.dataUrl }
}
