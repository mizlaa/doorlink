import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Role, type Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Users' }

const PAGE_SIZE = 25
const ROLES = Object.values(Role)

type PageProps = { searchParams: Promise<{ q?: string; role?: string; page?: string }> }

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  const params = await searchParams
  const q = (params.q ?? '').trim()
  const role = ROLES.includes(params.role as Role) ? (params.role as Role) : null
  const page = Math.max(1, Number(params.page) || 1)

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(q
      ? {
          OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }],
        }
      : {}),
  }

  let users
  let total
  try {
    ;[users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          technicianProfile: { select: { verified: true, businessName: true } },
          _count: { select: { requestedLeads: true, jobs: true } },
        },
      }),
      prisma.user.count({ where }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <NotConnected feature="Users" reason="Can't reach the database right now." />
  }

  const pages = Math.ceil(total / PAGE_SIZE)
  const qs = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (role) next.set('role', role)
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) next.delete(key)
      else next.set(key, value)
    }
    const s = next.toString()
    return s ? `/admin/users?${s}` : '/admin/users'
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-graphite">Users ({total})</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Everyone with an account. Roles are set at registration; this screen reads them rather than changing
          them, because changing someone&apos;s role changes what they can see and is not a one-click action.
        </p>
      </div>

      <form action="/admin/users" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          Search by name or email
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Name or email"
          className="h-10 min-w-0 flex-1 rounded border border-line bg-paper px-3 text-sm text-graphite placeholder:text-zinc focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
        />
        {role && <input type="hidden" name="role" value={role} />}
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded bg-signal px-4 text-sm font-medium text-paper hover:bg-signal-hover"
        >
          Search
        </button>
      </form>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by role">
        <RoleChip href={qs({ role: undefined, page: undefined })} active={!role}>
          All roles
        </RoleChip>
        {ROLES.map((candidate) => (
          <RoleChip key={candidate} href={qs({ role: candidate, page: undefined })} active={role === candidate}>
            {candidate.charAt(0) + candidate.slice(1).toLowerCase()}
          </RoleChip>
        ))}
      </nav>

      {users.length === 0 ? (
        <EmptyState title="Nobody matches" description="Try a different name, email or role." />
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-paper px-4 py-3 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-graphite">
                  {user.technicianProfile?.businessName || user.name}
                </span>
                <span className="mt-0.5 block text-micro text-zinc-deep">
                  {user.email}
                  {user._count.requestedLeads > 0 && ` · ${user._count.requestedLeads} requests`}
                  {user._count.jobs > 0 && ` · ${user._count.jobs} jobs`}
                  {' · joined '}
                  {user.createdAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                {user.technicianProfile?.verified && <Badge tone="good">Verified</Badge>}
                <Badge tone="neutral">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</Badge>
                {user.technicianProfile && (
                  <Link
                    href={`/technicians/${user.id}`}
                    className="font-medium text-signal hover:text-signal-hover"
                  >
                    Profile
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
          {page > 1 && (
            <Link
              href={qs({ page: String(page - 1) })}
              className="font-medium text-signal hover:text-signal-hover"
            >
              ← Previous
            </Link>
          )}
          <span className="text-zinc-deep">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={qs({ page: String(page + 1) })}
              className="font-medium text-signal hover:text-signal-hover"
            >
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}

function RoleChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-signal bg-signal-tint font-medium text-signal'
          : 'border-line bg-paper text-graphite hover:border-zinc'
      )}
    >
      {children}
    </Link>
  )
}
