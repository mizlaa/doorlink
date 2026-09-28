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

export type ManufacturerFormState = { error?: string }

const DATA_SOURCES = ['DEMO', 'MANUFACTURER_VERIFIED', 'ADMIN_VERIFIED', 'COMMUNITY_SUBMITTED', 'IMPORTED'] as const

const manufacturerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a manufacturer name.'),
  slug: z.string().trim().optional(),
  dataSource: z.enum(DATA_SOURCES),
})

// Server Actions are callable directly, not only through the guarded
// /admin layout — every action re-checks permission itself rather than
// trusting the page it was rendered from.
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

export async function createManufacturerAction(
  _prevState: ManufacturerFormState,
  formData: FormData
): Promise<ManufacturerFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = manufacturerSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
    dataSource: formData.get('dataSource'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const slug = slugify(parsed.data.slug || parsed.data.name)
  if (!slug) return { error: 'Enter a name that produces a usable slug.' }

  try {
    const existing = await prisma.manufacturer.findUnique({ where: { slug } })
    if (existing) return { error: `A manufacturer with the slug "${slug}" already exists.` }

    await prisma.manufacturer.create({
      data: { name: parsed.data.name, slug, dataSource: DataSource[parsed.data.dataSource] },
    })
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/manufacturers')
  redirect('/admin/manufacturers')
}

export async function updateManufacturerAction(
  id: string,
  _prevState: ManufacturerFormState,
  formData: FormData
): Promise<ManufacturerFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const parsed = manufacturerSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
    dataSource: formData.get('dataSource'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const slug = slugify(parsed.data.slug || parsed.data.name)
  if (!slug) return { error: 'Enter a name that produces a usable slug.' }

  try {
    const clashing = await prisma.manufacturer.findFirst({ where: { slug, NOT: { id } } })
    if (clashing) return { error: `Another manufacturer already uses the slug "${slug}".` }

    await prisma.manufacturer.update({
      where: { id },
      data: { name: parsed.data.name, slug, dataSource: DataSource[parsed.data.dataSource] },
    })
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'This manufacturer no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/manufacturers')
  redirect('/admin/manufacturers')
}

export async function deleteManufacturerAction(
  _prevState: ManufacturerFormState,
  formData: FormData
): Promise<ManufacturerFormState> {
  try {
    await assertCanManageCatalogue()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    throw error
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing manufacturer id.' }

  try {
    await prisma.manufacturer.delete({ where: { id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return { error: 'Cannot delete: this manufacturer still has product lines or models linked to it.' }
    }
    if (isRecordNotFound(error)) return { error: 'This manufacturer no longer exists.' }
    if (isDatabaseUnreachable(error)) return { error: 'The catalogue database is not reachable right now.' }
    throw error
  }

  revalidatePath('/admin/manufacturers')
  redirect('/admin/manufacturers')
}
