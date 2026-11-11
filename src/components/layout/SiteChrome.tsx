'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Screens that bring their own header and navigation. The designer is a
 * full-screen tool laid out from an approved design, so the site header,
 * footer and tab bar step aside there.
 */
const OWN_CHROME = ['/configure']

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (OWN_CHROME.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null
  return <>{children}</>
}
