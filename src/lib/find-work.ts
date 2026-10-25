import { can } from '@/lib/rbac'
import type { Role } from '@prisma/client'

/**
 * Where "Find work" should take someone, or null if it should not show.
 *
 * The job board (/leads) quietly redirects anyone who cannot quote back to
 * the home page, which reads as a broken link. So a trade account goes to
 * the board, a visitor who is not signed in goes to registration, and a
 * signed-in customer — who has no work to find — is not offered the link.
 */
export function findWorkHref(session: { role: Role } | null): string | null {
  if (!session) return '/register'
  return can(session.role, 'marketplace:quote') ? '/leads' : null
}
