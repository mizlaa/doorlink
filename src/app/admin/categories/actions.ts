'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { requirePermission, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import { slugify } from '@/lib/slug'
import { requireTradeSubscription, isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'

export type CategoryFormState = { error?: string }

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name.'),
  slug: z.string().trim().optional(),
  parentId: z.string().trim().optional(),
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

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
    parentId: formData.get('parentId') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const slug = slugify(parsed.data.slug || parsed.data.name)
  if (!slug) return { error: 'Enter a name that produces a usable slug.' }

  try {
    const existing = await prisma.category.findUnique({ where: { slug } })
    if (existing) return { error: `A category with the slug "${slug}" already exists.` }

    await prisma.category.create({
      data: { name: parsed.data.name, slug, parentId: parsed.data.parentId || null },
    })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/categories')
  redirect('/admin/categories')
}

export async function updateCategoryAction(
  id: string,
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
    parentId: formData.get('parentId') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  if (parsed.data.parentId === id) {
    return { error: 'A category cannot be its own parent.' }
  }

  const slug = slugify(parsed.data.slug || parsed.data.name)
  if (!slug) return { error: 'Enter a name that produces a usable slug.' }

  try {
    const clashing = await prisma.category.findFirst({ where: { slug, NOT: { id } } })
    if (clashing) return { error: `Another category already uses the slug "${slug}".` }

    await prisma.category.update({
      where: { id },
      data: { name: parsed.data.name, slug, parentId: parsed.data.parentId || null },
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'This category no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/categories')
  redirect('/admin/categories')
}

export async function deleteCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing category id.' }

  try {
    await prisma.category.delete({ where: { id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return { error: 'Cannot delete: this category still has models or subcategories linked to it.' }
    }
    if (isRecordNotFound(error)) return { error: 'This category no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/categories')
  redirect('/admin/categories')
}
