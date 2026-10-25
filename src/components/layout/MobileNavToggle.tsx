'use client'

import Link from 'next/link'
import { useState } from 'react'

interface NavLink {
  href: string
  label: string
}

interface SessionSummary {
  name: string
}

export function MobileNavToggle({
  links,
  session,
  signOutAction,
}: {
  links: NavLink[]
  session: SessionSummary | null
  signOutAction: (formData: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          {open ? (
            <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <nav
          id="mobile-nav"
          className="absolute inset-x-0 top-full z-10 border-t border-line bg-paper lg:hidden"
        >
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block px-4 py-3 text-sm font-medium text-graphite hover:bg-rail"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="border-t border-line">
              {session ? (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-zinc-deep">{session.name}</span>
                  <form action={signOutAction}>
                    <button type="submit" className="text-sm font-medium text-signal hover:text-signal-hover">
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href="/sign-in"
                  className="block px-4 py-3 text-sm font-medium text-signal hover:bg-rail"
                  onClick={() => setOpen(false)}
                >
                  Sign in
                </Link>
              )}
            </li>
          </ul>
        </nav>
      )}
    </>
  )
}
