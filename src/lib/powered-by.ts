import { prisma } from './prisma'
import { isDatabaseUnreachable } from './db-errors'
import type { Session } from './auth'

/**
 * Whose name goes behind the door on the homepage: "Powered by …".
 *
 * The person running the app is the one powering it, so a technician or
 * supplier sees their business, and anyone else sees their own name.
 * Signed out, there is nobody to name, and the door opens on an empty
 * garage rather than on a slogan.
 */
export async function poweredByName(session: Session | null): Promise<string | null> {
  if (!session) return null
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        name: true,
        technicianProfile: { select: { businessName: true } },
        memberships: { select: { organization: { select: { name: true } } }, take: 1 },
      },
    })
    const name =
      user?.technicianProfile?.businessName?.trim() ||
      user?.memberships[0]?.organization.name.trim() ||
      user?.name.trim() ||
      session.name.trim()
    return name || null
  } catch (error) {
    if (isDatabaseUnreachable(error)) return session.name.trim() || null
    throw error
  }
}
