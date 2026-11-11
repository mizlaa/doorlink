'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface BusinessNavItem {
  href: string
  label: string
  /** A count that needs attention (pending requests, overdue invoices). */
  count?: number
}

/** The business area's navigation: a scrolling row on a phone, the same row on desktop. */
export function BusinessNav({ items }: { items: BusinessNavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Your business">
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.href === '/business' ? pathname === '/business' : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors',
                  active ? 'bg-graphite text-paper' : 'text-graphite-soft hover:bg-rail hover:text-graphite'
                )}
              >
                {item.label}
                {item.count ? (
                  <span className={cn('rounded-full px-1.5 text-micro font-bold tabular-nums', active ? 'bg-paper text-graphite' : 'bg-caution text-paper')}>
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
