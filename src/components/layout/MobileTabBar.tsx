import { NavigationLink as Link } from '@/components/ui/NavigationLink'
import { getSession } from '@/lib/auth'

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 10.5 11 4l7 6.5M6 9v8h10V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="9.5" cy="9.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m17 17-3.4-3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function BagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M6 8h10l-1 10H7L6 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 8V6a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 18c1.2-3 4-4.5 6.5-4.5s5.3 1.5 6.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v14H5.5A1.5 1.5 0 0 1 4 16.5v-11Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M18 5.5A1.5 1.5 0 0 0 16.5 4H12v14h4.5a1.5 1.5 0 0 0 1.5-1.5v-11Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function JobIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3.5" y="7.5" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 7.5V6a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 13.5 6v1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.5 11.5h15" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

// A persistent bottom tab bar, the pattern people expect from an installed
// app rather than a website — the hamburger menu (MobileNavToggle) still
// covers everything else, this just surfaces the handful of destinations
// worth one tap. Hidden at the sm breakpoint, where the header's own nav
// takes over.
export async function MobileTabBar() {
  const session = await getSession()

  // Signed in, the fourth tab is the work you have on rather than the
  // shop — a technician opens this app between jobs, not to browse.
  const tabs = [
    { href: '/', label: 'Home', icon: <HomeIcon /> },
    { href: '/find', label: 'Find', icon: <SearchIcon /> },
    { href: '/manuals', label: 'Manuals', icon: <BookIcon /> },
    session
      ? { href: '/jobs', label: 'Jobs', icon: <JobIcon /> }
      : { href: '/marketplace', label: 'Market', icon: <BagIcon /> },
    session
      ? { href: '/account', label: 'Account', icon: <UserIcon /> }
      : { href: '/sign-in', label: 'Sign in', icon: <UserIcon /> },
  ]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex-1">
            <Link
              href={tab.href}
              className="flex flex-col items-center gap-0.5 px-1 py-2.5 text-graphite-soft transition-colors hover:text-signal"
            >
              {tab.icon}
              <span className="text-[11px] font-medium">{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
