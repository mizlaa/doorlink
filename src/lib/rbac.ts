import type { Role } from '@prisma/client'
import type { Session } from './auth'

// The permission matrix is the source of truth for access — routes and
// components check `can()` or call the guards below, never `role === '...'`.
export type Permission =
  | 'catalogue:read'
  | 'catalogue:write'
  | 'listing:read'
  | 'listing:write:own'
  | 'listing:write:any'
  | 'order:read:own'
  | 'order:read:any'
  | 'job:read:own'
  | 'job:write:own'
  | 'job:write:any'
  | 'lead:read:assigned'
  | 'lead:write:own'
  | 'lead:write:any'
  // Seeing the open job board and quoting on it. Separate from
  // lead:write:* because "can bid for work" and "can administer other
  // people's requests" are genuinely different powers.
  | 'marketplace:quote'
  | 'marketplace:hire'
  | 'support:read:own'
  | 'support:write:any'
  | 'import:write'
  // Uploading a manual the library does not have. Granted to every
  // signed-in role: the whole point is to collect documents Doorlink
  // lacks, and gating that behind a trade role would lose the homeowner
  // holding the only copy of an opener manual from 1998.
  | 'manual:submit'
  // Approving one into the public library. Admin only, and deliberately
  // separate from manual:submit — submitting and publishing are
  // different powers, and nothing in the system may hold both
  // implicitly.
  | 'manual:review'
  | 'admin:settings'
  // The inspection engine. Carrying out an inspection and administering
  // the asset register are separate powers: a subcontracted technician
  // may need the first without the second. `inspection:template:write`
  // is separate again — editing the questions everyone is asked is a
  // bigger power than answering them.
  | 'inspection:read'
  | 'inspection:write'
  | 'asset:write'
  | 'inspection:template:write'
  // Automated quoting. A business manages only its own price list
  // (scoped to its organization in src/lib/quoting/company.ts, never by
  // role alone). Platform admins deliberately do not get it: a company's
  // prices are its own commercial information.
  | 'pricing:manage:own'
  | 'quote:request'

// listing:write:own is granted to every role — Doorlink's marketplace is
// peer-to-peer (anyone with an account can list an item, business or
// not), not gated behind registering as a Supplier organization. What
// still differs by role is listing:write:any (moderate anyone's listing)
// and whether an account happens to have a supplier organization
// attached, which changes who a listing is sold *as*, not whether it can
// be created at all.
const MATRIX: Record<Role, Permission[]> = {
  CUSTOMER: [
    'catalogue:read',
    'listing:read',
    'listing:write:own',
    'order:read:own',
    'job:read:own',
    'job:write:own',
    'marketplace:hire',
    'support:read:own',
    'manual:submit',
    'quote:request',
  ],
  TECHNICIAN: [
    'catalogue:read',
    'listing:read',
    'listing:write:own',
    'job:read:own',
    'job:write:own',
    'lead:read:assigned',
    'lead:write:own',
    'marketplace:quote',
    'marketplace:hire',
    'support:read:own',
    'inspection:read',
    'inspection:write',
    'asset:write',
    'manual:submit',
    'pricing:manage:own',
    'quote:request',
  ],
  SUPPLIER: [
    'catalogue:read',
    'listing:read',
    'listing:write:own',
    'order:read:any',
    'marketplace:hire',
    'support:read:own',
    'manual:submit',
    'pricing:manage:own',
    'quote:request',
  ],
  MANUFACTURER: [
    'catalogue:read',
    'catalogue:write',
    'listing:read',
    'listing:write:own',
    'import:write',
    'marketplace:hire',
    'support:read:own',
    'manual:submit',
    'pricing:manage:own',
    'quote:request',
  ],
  ADMIN: [
    'catalogue:read',
    'catalogue:write',
    'listing:read',
    'listing:write:own',
    'listing:write:any',
    'order:read:any',
    'job:read:own',
    'job:write:any',
    'lead:read:assigned',
    'lead:write:any',
    'marketplace:quote',
    'marketplace:hire',
    'support:read:own',
    'manual:submit',
    'support:write:any',
    'import:write',
    'manual:review',
    'admin:settings',
    'inspection:read',
    'inspection:write',
    'asset:write',
    'inspection:template:write',
    'quote:request',
  ],
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false
}

export class RbacError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'RbacError'
    this.status = status
  }
}

export function requireSession(session: Session | null): Session {
  if (!session) throw new RbacError('Sign-in required', 401)
  return session
}

export function requirePermission(session: Session | null, permission: Permission): Session {
  const active = requireSession(session)
  if (!can(active.role, permission)) throw new RbacError('Not permitted', 403)
  return active
}
