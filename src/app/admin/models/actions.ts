'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { DataSource, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requirePermission, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import { slugify } from '@/lib/slug'
import { requireTradeSubscription, isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'

export type ModelFormState = { error?: string }

const DATA_SOURCES = ['DEMO', 'MANUFACTURER_VERIFIED', 'ADMIN_VERIFIED', 'COMMUNITY_SUBMITTED', 'IMPORTED'] as const

const modelSchema = z.object({
  manufacturerId: z.string().trim().min(1, 'Choose a manufacturer.'),
  categoryId: z.string().trim().min(1, 'Choose a category.'),
  productLineId: z.string().trim().optional(),
  name: z.string().trim().min(1, 'Enter a model name.'),
  modelCode: z.string().trim().min(1, 'Enter a model code.'),
  slug: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  dataSource: z.enum(DATA_SOURCES),
})

async function assertCanManageCatalogue() {
  const session = await getSession()
  const allowed = requirePermission(session, 'catalogue:write')
  try {
    await requireTradeSubscription(allowed)
  } catch (error) {
    if (isTradeSubscriptionRequiredError(error)) throw new RbacError(error.message, 403)
    throw error
  }
  return allowed
}

function readForm(formData: FormData) {
  return modelSchema.safeParse({
    manufacturerId: formData.get('manufacturerId'),
    categoryId: formData.get('categoryId'),
    productLineId: formData.get('productLineId') || undefined,
    name: formData.get('name'),
    modelCode: formData.get('modelCode'),
    slug: formData.get('slug') || undefined,
    summary: formData.get('summary') || undefined,
    dataSource: formData.get('dataSource'),
  })
}

// A product line belongs to one manufacturer — cross-check it rather than
// trusting the client to only ever submit a matching pair.
async function validateProductLine(manufacturerId: string, productLineId: string | undefined) {
  if (!productLineId) return null
  const productLine = await prisma.productLine.findUnique({ where: { id: productLineId } })
  if (!productLine || productLine.manufacturerId !== manufacturerId) {
    return 'The chosen product line does not belong to the chosen manufacturer.'
  }
  return null
}

export async function createModelAction(_prevState: ModelFormState, formData: FormData): Promise<ModelFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = readForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  const { manufacturerId, categoryId, productLineId, name, modelCode, summary, dataSource } = parsed.data

  try {
    const productLineError = await validateProductLine(manufacturerId, productLineId)
    if (productLineError) return { error: productLineError }

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } })
    if (!manufacturer) return { error: 'That manufacturer no longer exists.' }

    const slug = slugify(parsed.data.slug || `${manufacturer.slug}-${name}`)
    if (!slug) return { error: 'Enter a name that produces a usable slug.' }

    const [slugClash, codeClash] = await Promise.all([
      prisma.model.findUnique({ where: { slug } }),
      prisma.model.findUnique({ where: { manufacturerId_modelCode: { manufacturerId, modelCode } } }),
    ])
    if (slugClash) return { error: `A model with the slug "${slug}" already exists.` }
    if (codeClash) return { error: `This manufacturer already has a model with code "${modelCode}".` }

    await prisma.model.create({
      data: {
        manufacturerId,
        categoryId,
        productLineId: productLineId || null,
        name,
        modelCode,
        slug,
        summary: summary || null,
        dataSource: DataSource[dataSource],
      },
    })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/models')
  redirect('/admin/models')
}

export async function updateModelAction(
  id: string,
  _prevState: ModelFormState,
  formData: FormData
): Promise<ModelFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = readForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  const { manufacturerId, categoryId, productLineId, name, modelCode, summary, dataSource } = parsed.data

  try {
    const productLineError = await validateProductLine(manufacturerId, productLineId)
    if (productLineError) return { error: productLineError }

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } })
    if (!manufacturer) return { error: 'That manufacturer no longer exists.' }

    const slug = slugify(parsed.data.slug || `${manufacturer.slug}-${name}`)
    if (!slug) return { error: 'Enter a name that produces a usable slug.' }

    const [slugClash, codeClash] = await Promise.all([
      prisma.model.findFirst({ where: { slug, NOT: { id } } }),
      prisma.model.findFirst({ where: { manufacturerId, modelCode, NOT: { id } } }),
    ])
    if (slugClash) return { error: `Another model already uses the slug "${slug}".` }
    if (codeClash) return { error: `This manufacturer already has a different model with code "${modelCode}".` }

    await prisma.model.update({
      where: { id },
      data: {
        manufacturerId,
        categoryId,
        productLineId: productLineId || null,
        name,
        modelCode,
        slug,
        summary: summary || null,
        dataSource: DataSource[dataSource],
      },
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'This model no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/models')
  redirect('/admin/models')
}

export async function deleteModelAction(_prevState: ModelFormState, formData: FormData): Promise<ModelFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing model id.' }

  try {
    await prisma.model.delete({ where: { id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return { error: 'Cannot delete: this model still has active listings. Remove or reassign them first.' }
    }
    if (isRecordNotFound(error)) return { error: 'This model no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/models')
  redirect('/admin/models')
}
