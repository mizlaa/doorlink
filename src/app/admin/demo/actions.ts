'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { isDemo } from '@/lib/demo/mode'
import { resetDemoDatabase } from '@/lib/demo/seed'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac'

/**
 * Restores the demo database to its seed. Admin only, demo mode only, and
 * the database name is checked again inside resetDemoDatabase before
 * anything is truncated.
 */
export async function resetDemoDataAction(): Promise<void> {
  if (!isDemo()) redirect('/admin')
  requirePermission(await getSession(), 'admin:settings')
  await resetDemoDatabase(prisma)
  revalidatePath('/', 'layout')
  redirect('/admin?demo=reset')
}
