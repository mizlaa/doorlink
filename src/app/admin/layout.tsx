import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can, type Permission } from '@/lib/rbac'

// `permission` is the gate for the link, not just for the page behind
// it: this section is open to anyone who can edit the catalogue, which
// includes manufacturers, and they have no business being shown a link
// to Doorlink's commission rate.
const ADMIN_NAV: Array<{
  href: string
  label: string
  permission?: Permission
}> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/manufacturers', label: 'Manufacturers' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/models', label: 'Models' },
  { href: '/admin/compatibility', label: 'Compatibility' },
  {
    href: '/admin/marketplace',
    label: 'Marketplace',
    permission: 'lead:write:any',
  },
  { href: '/admin/verification', label: 'Verification', permission: 'admin:settings' },
  { href: '/admin/users', label: 'Users', permission: 'admin:settings' },
  { href: '/admin/disputes', label: 'Disputes', permission: 'admin:settings' },
  { href: '/admin/reports', label: 'Reports', permission: 'admin:settings' },
  { href: '/admin/subscriptions', label: 'Subscriptions', permission: 'admin:settings' },
  { href: '/admin/metrics', label: 'Metrics', permission: 'admin:settings' },
  { href: '/admin/settings', label: 'Settings', permission: 'admin:settings' },
]

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'catalogue:write')) redirect('/')

  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <div className="mb-8 flex flex-col gap-1 border-b border-line pb-6">
        <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">Admin</p>
        <h1 className="text-2xl font-semibold text-graphite">Administration</h1>
      </div>
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Wraps on a phone rather than pushing the page sideways: there
            are seven destinations now, and in one row they are nearly twice
            the width of a 390px screen. */}
        <nav className="flex shrink-0 flex-row flex-wrap gap-2 lg:w-48 lg:flex-col lg:flex-nowrap">
          {ADMIN_NAV.filter((item) => !item.permission || can(session.role, item.permission)).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm font-medium text-graphite hover:bg-rail"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
