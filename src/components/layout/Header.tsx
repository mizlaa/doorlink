import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { signOutAction } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { unreadNotificationCount } from '@/lib/notifications'
import { unreadMessageCount } from '@/lib/messaging'
import { HeaderSearch } from './HeaderSearch'
import { MobileNavToggle } from './MobileNavToggle'
import { AccountMenu } from './AccountMenu'

// Four destinations, named the way the landing page names them. "Data
// sources" moved to the footer: it matters, but it is not something
// someone arrives wanting, and a five-item row was crowding the ones
// that are.
const NAV_LINKS = [
  { href: '/request-technician', label: 'Find a professional' },
  { href: '/configure', label: 'Design a door' },
  { href: '/find', label: 'Door systems' },
  { href: '/manuals/finder', label: 'Manuals' },
  { href: '/tools', label: 'Tools' },
  { href: '/marketplace', label: 'Parts' },
  { href: '/compliance', label: 'Compliance' },
]

/**
 * Counts shown in the header are decoration, not the page. If one cannot
 * be fetched it shows no number rather than taking every page down with
 * it.
 */
async function countOrZero(run: () => Promise<number>): Promise<number> {
  try {
    return await run()
  } catch (error) {
    if (isDatabaseUnreachable(error)) return 0
    throw error
  }
}

async function getCartItemCount(userId: string): Promise<number> {
  try {
    return await prisma.cartItem.count({ where: { cart: { userId } } })
  } catch (error) {
    // The header renders on every page — a cart count that can't be
    // fetched just doesn't show a number, it doesn't take the header down.
    if (isDatabaseUnreachable(error)) return 0
    throw error
  }
}

export async function Header() {
  const session = await getSession()
  const accountLinks: { href: string; label: string }[] = []

  if (session) {
    const [cartCount, messageCount, notificationCount] = await Promise.all([
      getCartItemCount(session.userId),
      countOrZero(() => unreadMessageCount(session.userId)),
      countOrZero(() => unreadNotificationCount(session.userId)),
    ])
    accountLinks.push({
      href: '/messages',
      label: messageCount > 0 ? `Messages (${messageCount})` : 'Messages',
    })
    accountLinks.push({
      href: '/notifications',
      label: notificationCount > 0 ? `Notifications (${notificationCount})` : 'Notifications',
    })
    accountLinks.push({ href: '/cart', label: cartCount > 0 ? `Cart (${cartCount})` : 'Cart' })
    accountLinks.push({ href: '/saved', label: 'Saved' })
    accountLinks.push({ href: '/account', label: 'Account' })
    if (can(session.role, 'listing:write:own')) {
      accountLinks.push({ href: '/my-listings', label: 'My listings' })
    }
    accountLinks.push({ href: '/my-requests', label: 'My requests' })
    // The job board is the technician's side of the same marketplace, so
    // it is gated on being able to quote rather than on owning leads.
    if (can(session.role, 'marketplace:quote')) {
      accountLinks.push({ href: '/leads', label: 'Job board' })
      accountLinks.push({ href: '/my-profile', label: 'Trade profile' })
      accountLinks.push({ href: '/earnings', label: 'Earnings' })
    }
    accountLinks.push({ href: '/jobs', label: 'Jobs' })
    // The asset register and its inspections. Gated on the permission
    // rather than the role, and only useful inside an organisation — the
    // page itself says so when someone has none.
    if (can(session.role, 'inspection:read')) {
      accountLinks.push({ href: '/inspections', label: 'Inspections' })
    }
    accountLinks.push({ href: '/account/subscription', label: 'Subscription' })
    accountLinks.push({ href: '/support', label: 'Support' })
    if (can(session.role, 'catalogue:write')) {
      accountLinks.push({ href: '/admin', label: 'Admin' })
    }
  }

  // The mobile hamburger still shows everything flat — on a phone there's
  // no crowded single row to protect, and the bottom tab bar already
  // covers the handful of destinations worth one tap.
  const mobileLinks = [...NAV_LINKS, ...accountLinks]

  return (
    <header className="relative z-20 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-shell items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-graphite">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-graphite text-[10px] font-bold tracking-normal text-paper">
            DL
          </span>
          <span>Doorlink</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <HeaderSearch />
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-graphite-soft transition-colors hover:text-signal"
            >
              {link.label}
            </Link>
          ))}
          {session ? (
            <AccountMenu name={session.name} links={accountLinks} signOutAction={signOutAction} />
          ) : (
            <Link
              href="/sign-in"
              className="border-l border-line pl-6 text-sm font-medium text-signal hover:text-signal-hover"
            >
              Sign in
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-1 md:hidden">
          <HeaderSearch />
          <MobileNavToggle
            links={mobileLinks}
            session={session ? { name: session.name } : null}
            signOutAction={signOutAction}
          />
        </div>
      </div>
    </header>
  )
}
