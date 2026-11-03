import { NavigationLink as Link } from '@/components/ui/NavigationLink'
import { can } from '@/lib/rbac'
import { findWorkHref } from '@/lib/find-work'
import { MobileNavToggle } from '@/components/layout/MobileNavToggle'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { HeaderSearch } from './HeaderSearch'
import { useDemo } from '../demo/store'
import { signOutAction } from '../actions/auth'
import { conversationsFor } from '../demo/messages'

// The app's Header (src/components/layout/Header.tsx), reading the demo
// session instead of the server one. Same links, same order, same markup.
function navLinks(workHref: string | null) {
  return [
    { href: '/request-technician', label: 'Hire a pro' },
    ...(workHref ? [{ href: workHref, label: 'Find work' }] : []),
    { href: '/marketplace', label: 'Marketplace' },
    { href: '/manuals', label: 'Manuals' },
    { href: '/tools', label: 'Tools' },
  ]
}

export function Header() {
  const session = useDemo((s) => s.session)
  const conversations = useDemo((s) => s.conversations)
  const notifications = useDemo((s) => s.notifications)
  const savedListings = useDemo((s) => s.savedListings)
  const accounts = useDemo((s) => s.accounts)
  const accountLinks: { href: string; label: string }[] = []

  if (session) {
    const messageCount = conversationsFor(conversations, session, accounts).reduce((n, c) => n + c.unread, 0)
    const notificationCount = notifications.filter((n) => n.userId === session.userId && !n.read).length
    accountLinks.push({ href: '/messages', label: messageCount > 0 ? `Messages (${messageCount})` : 'Messages' })
    accountLinks.push({
      href: '/notifications',
      label: notificationCount > 0 ? `Notifications (${notificationCount})` : 'Notifications',
    })
    accountLinks.push({ href: '/saved', label: savedListings.length > 0 ? `Saved (${savedListings.length})` : 'Saved' })
    accountLinks.push({ href: '/account', label: 'Account' })
    if (can(session.role, 'listing:write:own')) accountLinks.push({ href: '/my-listings', label: 'My listings' })
    accountLinks.push({ href: '/my-requests', label: 'My requests' })
    if (can(session.role, 'quote:request')) accountLinks.push({ href: '/quotes', label: 'My quotes' })
    if (can(session.role, 'pricing:write:own')) accountLinks.push({ href: '/pricing', label: 'Automated pricing' })
    if (can(session.role, 'marketplace:quote')) accountLinks.push({ href: '/leads', label: 'Job board' })
    if (session.demoRole === 'supplier' || session.demoRole === 'manufacturer')
      accountLinks.push({ href: '/dashboard', label: 'Dashboard' })
    accountLinks.push({ href: '/jobs', label: 'Jobs' })
    accountLinks.push({ href: '/demo', label: 'Demo guide' })
    if (can(session.role, 'catalogue:write')) accountLinks.push({ href: '/admin', label: 'Admin' })
  }

  const primaryLinks = navLinks(findWorkHref(session))
  const mobileLinks = [...primaryLinks, ...accountLinks]

  return (
    <header className="relative z-20 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-shell items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-graphite">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-graphite text-[10px] font-bold tracking-normal text-paper">
            DL
          </span>
          <span>Doorlink</span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          <HeaderSearch />
          {primaryLinks.map((link) => (
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
            <Link href="/sign-in" className="border-l border-line pl-6 text-sm font-medium text-signal hover:text-signal-hover">
              Sign in
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-1 lg:hidden">
          <HeaderSearch />
          <MobileNavToggle
            key={session?.userId ?? 'guest'}
            links={mobileLinks}
            session={session ? { name: session.name } : null}
            signOutAction={signOutAction}
          />
        </div>
      </div>
    </header>
  )
}
