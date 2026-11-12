import 'server-only'

import type { BusinessProfile } from '@prisma/client'
import type { Session } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/rbac'
import { jobActorFor, type JobActor } from '@/lib/marketplace'
import {
  businessIsSubscribed,
  businessKeyFor,
  businessUserIds,
  decodeBusinessKey,
  loadBusinessDetails,
  type BusinessKey,
} from '@/lib/pricing/business'
import { canManageBusiness, ensureBusinessProfile } from './profile'

/**
 * Who may do what inside a business.
 *
 *  - OWNER: the account behind the business (or the organisation's owner).
 *    Everything, including the brand, the team and payouts.
 *  - MANAGER: organisation staff, or a team member made a manager.
 *    Requests, the calendar, jobs, customers, invoices, stock, reports.
 *  - TECHNICIAN: a team member. Their own visits and the jobs those are for.
 *
 * Every page and action in the business area starts from `currentBusiness`
 * or `requireBusinessRole`, and every query is filtered by the business id
 * that comes back, never by an id from the request.
 */

export type BusinessRole = 'OWNER' | 'MANAGER' | 'TECHNICIAN'

const RANK: Record<BusinessRole, number> = { TECHNICIAN: 1, MANAGER: 2, OWNER: 3 }

export function roleAtLeast(role: BusinessRole, min: BusinessRole): boolean {
  return RANK[role] >= RANK[min]
}

export interface BusinessContext {
  businessId: string
  businessKey: string
  key: BusinessKey
  role: BusinessRole
  name: string
  timezone: string
  profile: BusinessProfile
}

export class BusinessAccessError extends Error {
  reason: 'signed-out' | 'no-business' | 'role' | 'subscription'
  constructor(reason: BusinessAccessError['reason'], message: string) {
    super(message)
    this.name = 'BusinessAccessError'
    this.reason = reason
  }
}

async function contextFor(profile: BusinessProfile, role: BusinessRole): Promise<BusinessContext | null> {
  const key = decodeBusinessKey(profile.businessKey)
  if (!key) return null
  const details = await loadBusinessDetails(key)
  return {
    businessId: profile.id,
    businessKey: profile.businessKey,
    key,
    role,
    name: details?.businessName?.trim() || 'Your business',
    timezone: profile.timezone,
    profile,
  }
}

/** Every business this person works in: their own, and any they have joined. */
export async function businessContexts(session: Session, options: { ensureOwn?: boolean } = {}): Promise<BusinessContext[]> {
  const contexts: BusinessContext[] = []

  if (can(session.role, 'pricing:write:own')) {
    const key = businessKeyFor(session)
    const own = options.ensureOwn
      ? await ensureBusinessProfile(key)
      : await prisma.businessProfile.findUnique({ where: { businessKey: `${key.kind === 'organization' ? 'o' : 'u'}_${key.id}` } })
    if (own) {
      const context = await contextFor(own, (await canManageBusiness(session, key)) ? 'OWNER' : 'MANAGER')
      if (context) contexts.push(context)
    }
  }

  const memberships = await prisma.businessMember.findMany({
    where: { userId: session.userId, status: 'ACTIVE' },
    include: { business: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const membership of memberships) {
    if (contexts.some((c) => c.businessId === membership.businessId)) continue
    const context = await contextFor(membership.business, membership.role)
    if (context) contexts.push(context)
  }
  return contexts
}

/**
 * The business this person is acting in. A team member with no business of
 * their own acts in the one they joined; an owner acts in theirs. A trade
 * account that hasn't set anything up yet gets its profile created here.
 */
export async function currentBusiness(session: Session): Promise<BusinessContext | null> {
  const contexts = await businessContexts(session)
  if (contexts.length > 0) {
    // Someone who works in more than one business picks which one they're in;
    // the choice only counts if they still belong to it. Otherwise their own comes first.
    const chosen = await chosenBusinessId()
    return contexts.find((c) => c.businessId === chosen) ?? contexts[0]
  }
  if (!can(session.role, 'pricing:write:own')) return null
  const [own] = await businessContexts(session, { ensureOwn: true })
  return own ?? null
}

/** The cookie that remembers which business someone is working in. Read only through businessContexts, so it can't grant access. */
export const BUSINESS_COOKIE = 'doorlink-business'

async function chosenBusinessId(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers')
    return (await cookies()).get(BUSINESS_COOKIE)?.value ?? null
  } catch {
    // Outside a request (scripts, tests): no choice made.
    return null
  }
}

/** The gate for business pages and actions. Throws BusinessAccessError. */
export async function requireBusinessRole(session: Session | null, min: BusinessRole): Promise<BusinessContext> {
  if (!session) throw new BusinessAccessError('signed-out', 'Sign in to continue.')
  const context = await currentBusiness(session)
  if (!context) throw new BusinessAccessError('no-business', 'This is for business accounts and their teams.')
  if (!roleAtLeast(context.role, min)) throw new BusinessAccessError('role', 'Your role in this business doesn’t allow that.')
  if (!(await businessIsSubscribed(context.key)))
    throw new BusinessAccessError('subscription', 'The business needs an active Doorlink trade subscription.')
  return context
}

/** The people who can be given a visit: the owner account(s) and active team members. */
export async function assignableTechnicians(context: Pick<BusinessContext, 'businessId' | 'key'>) {
  const [ownerIds, members] = await Promise.all([
    businessUserIds(context.key),
    prisma.businessMember.findMany({
      where: { businessId: context.businessId, status: 'ACTIVE' },
      select: { userId: true, role: true },
    }),
  ])
  const ids = [...new Set([...ownerIds, ...members.map((m) => m.userId)])]
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } })
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: ownerIds.includes(user.id) ? ('OWNER' as const) : (members.find((m) => m.userId === user.id)?.role ?? 'TECHNICIAN'),
  }))
}

/** This person's role in one business, or null when they have none. */
export async function roleInBusiness(session: Session, businessId: string): Promise<BusinessRole | null> {
  const contexts = await businessContexts(session)
  return contexts.find((c) => c.businessId === businessId)?.role ?? null
}

/**
 * How someone stands to a job: its customer, the business doing it, or an
 * admin. The business side is the account the job is with, a manager of
 * that business, or a technician booked on one of the job's visits.
 */
export async function resolveJobActor(
  job: { id?: string; customerId: string | null; workerId: string | null; businessId?: string | null },
  session: Session
): Promise<JobActor | null> {
  const direct = jobActorFor(job, session.userId, false)
  if (direct) return direct
  if (job.businessId) {
    const role = await roleInBusiness(session, job.businessId)
    if (role && roleAtLeast(role, 'MANAGER')) return 'worker'
    if (role === 'TECHNICIAN' && job.id) {
      const assigned = await prisma.appointment.count({ where: { jobId: job.id, technicianId: session.userId } })
      if (assigned > 0) return 'worker'
    }
  }
  return can(session.role, 'job:write:any') ? 'admin' : null
}
