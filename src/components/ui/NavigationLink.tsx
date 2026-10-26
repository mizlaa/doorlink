'use client'

import Link, { useLinkStatus } from 'next/link'
import type { ComponentProps } from 'react'

function PendingNavigation() {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <span
      role="status"
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-graphite shadow-lg sm:bottom-6"
    >
      Opening page…
    </span>
  )
}

/** Uses Next's actual transition state, so feedback clears on completion/cancel. */
export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <PendingNavigation />
    </Link>
  )
}
